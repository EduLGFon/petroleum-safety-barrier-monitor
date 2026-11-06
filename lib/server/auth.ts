// Request auth - ADMIN_TOKEN Bearer plus cookie sessions with roles.
// This is why it exists: the PATCH status path writes via
// record_status_change(), so it must not be callable by anyone with curl.
// Dashboard data reads require a session or token (Login => Dashboard);
// anonymous callers get 404 camouflage, invalid credentials get 401.
// Fail-closed: no valid credential means denial.
import {
  apiError,
  forbidden,
  notFound,
  unauthorized,
  unavailable,
} from "./errors.ts";

import {
  getSessionTokenFromRequest,
  hashSessionToken,
} from "./auth/session.ts";

import { getSessionUser, type SessionUser } from "./sql/sessions.ts";

import { log } from "./log.ts";

export type AdminRole = "admin";
export type RequestRole = "admin" | "user";

export type AdminAuthResult =
  | { ok: true; role: AdminRole }
  | { ok: false; message: string };

export type RequestAuth =
  | {
    ok: true;
    role: RequestRole;
    user: SessionUser | null;
    via: "token" | "session";
  }
  | { ok: false; message: string };

export type TokenGetter = () => string | undefined;

const defaultToken: TokenGetter = () => Deno.env.get("ADMIN_TOKEN");

// constantTimeEqual: avoids leaking the token prefix through timing. Cheap
// insurance for a bearer secret compared byte-by-byte.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// checkAdminAuth: Bearer token against ADMIN_TOKEN. The result carries a
// role (not just a boolean) so a future users-table lookup can return
// richer identities without changing call sites.
export function checkAdminAuth(
  req: Request,
  getToken: TokenGetter = defaultToken,
): AdminAuthResult {
  const configured = getToken();
  if (!configured) {
    return { ok: false, message: "admin token not configured" };
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header.trim());
  const presented = match?.[1];
  if (!presented || !constantTimeEqual(presented, configured)) {
    return { ok: false, message: "invalid admin token" };
  }
  return { ok: true, role: "admin" };
}

// resolveRequestAuth: token first (ops scripts), then cookie session
// (dashboard logins). Admin routes accept either; user identity rides along
// for audit when the session path wins.
export async function resolveRequestAuth(req: Request): Promise<RequestAuth> {
  const token = checkAdminAuth(req);
  if (token.ok) {
    return { ok: true, role: "admin", user: null, via: "token" };
  }
  const raw = getSessionTokenFromRequest(req);
  if (!raw) return { ok: false, message: token.message };
  // No catch-all here: a null row means an invalid session (401), but a
  // THROWN error means the session store is unreachable (DB blip) and must
  // propagate so routes answer 503 - never a spurious "invalid session"
  // that logs the user out for an infra failure.
  const user = await getSessionUser(await hashSessionToken(raw));
  if (!user) return { ok: false, message: "invalid session" };
  return { ok: true, role: user.role, user, via: "session" };
}

// PASSWORD_CHANGE_REQUIRED: the one message that must NOT read as a dead
// session. The account is valid and the person is signed in - they simply
// still carry the password the system generated. Routes deny with 403 and
// this exact code so the UI shows the change-password form instead of
// bouncing to login (a 401 here would log the person out forever: they can
// only fix it while signed in).
export const PASSWORD_CHANGE_REQUIRED = "password change required";

// pendingPasswordChange: true only for a SESSION whose user still carries a
// system-generated password. Token auth is exempt on purpose - ADMIN_TOKEN
// carries no user identity, so there is no password to change, and gating it
// would break the ops scripts and the smoke.
//
// Only a LOCAL account can be held here. An Entra account has no password at
// all, so it could never clear the flag: holding one would send the person to
// /trocar-senha forever, with nothing to type. The conversion clears the flag
// too, but this is the floor - a stale flag on an Entra row must not lock
// somebody out.
function pendingPasswordChange(auth: RequestAuth): boolean {
  return auth.ok && auth.via === "session" &&
    auth.user?.auth_source === "local" &&
    auth.user?.mustChangePassword === true;
}

// requireAdminAuth: guard for writes, user and alert management. Accepts a
// valid ADMIN_TOKEN or an active admin session; anything else denies.
export async function requireAdminAuth(req: Request): Promise<RequestAuth> {
  const auth = await resolveRequestAuth(req);
  if (!auth.ok) return auth;
  if (pendingPasswordChange(auth)) {
    return { ok: false, message: PASSWORD_CHANGE_REQUIRED };
  }
  if (auth.role !== "admin") return { ok: false, message: "admin only" };
  return auth;
}

// requireAuthenticated: guard for lookups needed by admin UI. Accepts a
// valid ADMIN_TOKEN or any active session (admin or user).
export async function requireAuthenticated(
  req: Request,
  opts: { allowPendingPasswordChange?: boolean } = {},
): Promise<RequestAuth> {
  const auth = await resolveRequestAuth(req);
  // The opt-out exists for exactly one caller: POST /api/auth/password, the
  // only way out of the pending state. Gating it would lock the door from
  // the inside - the person could neither use the app nor fix the password.
  // It is a named flag and not a path check so the exemption is greppable.
  if (!opts.allowPendingPasswordChange && pendingPasswordChange(auth)) {
    return { ok: false, message: PASSWORD_CHANGE_REQUIRED };
  }
  return auth;
}

// hasCredentials: true when the caller presented anything (session cookie
// or Authorization header), even if it later proves invalid. Pages and data
// routes use this to tell anonymous visitors (404 camouflage) from callers
// with dead credentials (401 + login redirect).
export function hasCredentials(req: Request): boolean {
  if (getSessionTokenFromRequest(req) !== null) return true;
  const header = req.headers.get("authorization") ?? "";
  return /^Bearer (.+)$/.test(header.trim());
}

// denyByCredentials: 404 camouflage ("not found", same shape as a missing
// route) for callers who presented nothing, 401 with the real reason for
// callers with dead credentials, 403 when an authenticated non-admin hits an
// admin-only route ("admin only" must not read as a dead session, or clients
// redirect to login in a loop). Use at every guarded route so anonymous
// visitors cannot map the API surface.
export function denyByCredentials(
  req: Request,
  message: string,
  requestId: string,
): Response {
  if (!hasCredentials(req)) {
    return apiError(404, "NOT_FOUND", "not found", requestId);
  }
  if (message === "admin only") return forbidden(message, requestId);
  // Not a 401: the credential is alive. 401 would make the client clear the
  // session and send the person to login, where the same password still
  // works and the loop repeats.
  if (message === PASSWORD_CHANGE_REQUIRED) {
    return apiError(403, "PASSWORD_CHANGE_REQUIRED", message, requestId);
  }
  return apiError(401, "UNAUTHORIZED", message, requestId);
}

export type DataAuth =
  | { ok: true; role: RequestRole; user: SessionUser | null }
  | { ok: false; anonymous: boolean; message: string };

// denyDataAuth: shared denial for dashboard data reads guarded by
// requireDataAuth. Anonymous callers get 404 camouflage, dead credentials
// get 401 with the real reason. One helper so every data route denies the
// same way instead of re-branching on `anonymous`.
export function denyDataAuth(dataAuth: DataAuth, requestId: string): Response {
  if (!dataAuth.ok) {
    if (dataAuth.message === PASSWORD_CHANGE_REQUIRED) {
      return apiError(403, "PASSWORD_CHANGE_REQUIRED", dataAuth.message, requestId);
    }
    return dataAuth.anonymous
      ? notFound("not found", requestId)
      : unauthorized(dataAuth.message, requestId);
  }
  throw new Error("denyDataAuth called with ok auth");
}

// authStoreUnavailable: shared 503 for a throwing auth store (DB blip after
// the pool retry gave up). A dead database must read as 503 with Retry-After,
// never as 401 that logs the user out. Call inside `catch` around
// requireDataAuth / requireAdminAuth / requireAuthenticated.
export function authStoreUnavailable(
  logLabel: string,
  err: unknown,
  requestId: string,
): Response {
  log.child({ scope: "auth", requestId }).error(logLabel, { err });
  return unavailable("Auth store unreachable", requestId);
}

// requireDataAuth: guard for dashboard data reads (barriers, KPI, chart,
// export, vocabularies). Accepts ADMIN_TOKEN or any active session so ops
// scripts keep working; anonymous callers are flagged for 404 camouflage
// while invalid credentials stay 401.
export async function requireDataAuth(req: Request): Promise<DataAuth> {
  const anonymous = !hasCredentials(req);
  const auth = await resolveRequestAuth(req);
  if (auth.ok && pendingPasswordChange(auth)) {
    return { ok: false, anonymous: false, message: PASSWORD_CHANGE_REQUIRED };
  }
  if (auth.ok) return { ok: true, role: auth.role, user: auth.user };
  return { ok: false, anonymous, message: auth.message };
}

// resolveAllowedLocationIds: fail-closed station scope for data reads.
// Admin => null (unrestricted). Every non-admin, including a legacy
// ungrouped user or a malformed session, gets an explicit array; empty
// means no access. Never let a null/undefined value widen a non-admin.
export function resolveAllowedLocationIds(
  auth: {
    role: string;
    user?: { allowedLocationIds?: number[] | null } | null;
  },
): number[] | null {
  if (auth.role === "admin") return null;
  const v = auth.user?.allowedLocationIds;
  if (Array.isArray(v)) return v;
  return [];
}
