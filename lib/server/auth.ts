// Request auth - ADMIN_TOKEN Bearer plus cookie sessions with roles.
// This is why it exists: the PATCH status path writes via
// record_status_change(), so it must not be callable by anyone with curl.
// Reads stay open (dashboard decision, documented in docs/API.md); writes,
// user management, recipients and alert rules go through the session-aware
// resolvers below. Fail-closed: no token and no session means denial.
import {
  getSessionTokenFromRequest,
  hashSessionToken,
} from "./auth/session.ts";

import { getSessionUser, type SessionUser } from "./sql/sessions.ts";

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
  try {
    const user = await getSessionUser(await hashSessionToken(raw));
    if (!user) return { ok: false, message: "invalid session" };
    return { ok: true, role: user.role, user, via: "session" };
  } catch {
    return { ok: false, message: "invalid session" };
  }
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
