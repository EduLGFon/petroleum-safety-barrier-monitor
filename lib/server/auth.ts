// Request auth - ADMIN_TOKEN Bearer plus cookie sessions with roles.
// This is why it exists: the PATCH status path writes via
// record_status_change(), so it must not be callable by anyone with curl.
// Dashboard data reads require a session or token (Login => Dashboard);
// anonymous callers get 404 camouflage, invalid credentials get 401.
// Fail-closed: no valid credential means denial.
import {
  getSessionTokenFromRequest,
  hashSessionToken,
} from "./auth/session.ts";

import { getSessionUser, type SessionUser } from "./sql/sessions.ts";

import {
  apiError,
  forbidden,
  notFound,
  unauthorized,
  unavailable,
} from "./errors.ts";

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

// requireAdminAuth: guard for writes, user and alert management. Accepts a
// valid ADMIN_TOKEN or an active admin session; anything else denies.
export async function requireAdminAuth(req: Request): Promise<RequestAuth> {
  const auth = await resolveRequestAuth(req);
  if (!auth.ok) return auth;
  if (auth.role !== "admin") return { ok: false, message: "admin only" };
  return auth;
}

// requireAuthenticated: guard for lookups needed by admin UI. Accepts a
// valid ADMIN_TOKEN or any active session (admin or user).
export async function requireAuthenticated(req: Request): Promise<RequestAuth> {
  return await resolveRequestAuth(req);
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
  console.error(`[${logLabel}] requestId=${requestId}`, err);
  return unavailable("Auth store unreachable", requestId);
}

// requireDataAuth: guard for dashboard data reads (barriers, KPI, chart,
// export, vocabularies). Accepts ADMIN_TOKEN or any active session so ops
// scripts keep working; anonymous callers are flagged for 404 camouflage
// while invalid credentials stay 401.
export async function requireDataAuth(req: Request): Promise<DataAuth> {
  const anonymous = !hasCredentials(req);
  const auth = await resolveRequestAuth(req);
  if (auth.ok) return { ok: true, role: auth.role, user: auth.user };
  return { ok: false, anonymous, message: auth.message };
}
