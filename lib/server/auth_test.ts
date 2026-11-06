// Unit tests for admin auth (P4) - fail-closed, Bearer only.
import {
  authStoreUnavailable,
  checkAdminAuth,
  denyByCredentials,
  denyDataAuth,
  PASSWORD_CHANGE_REQUIRED,
  pendingPasswordChange,
  resolveAllowedLocationIds,
} from "./auth.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { SessionUser } from "./sql/sessions.ts";

import type { RequestAuth } from "./auth.ts";

function req(authHeader?: string): Request {
  return new Request(
    "http://localhost/api/barriers/1/status",
    authHeader ? { headers: { authorization: authHeader } } : {},
  );
}

Deno.test("checkAdminAuth denies everything when no token is configured", () => {
  const r = checkAdminAuth(req("Bearer s3cret"), () => undefined);
  assertStrictEquals(r.ok, false);
  if (r.ok) throw new Error("unreachable");
  assertStrictEquals(r.message, "admin token not configured");
});

Deno.test("checkAdminAuth denies a missing or malformed header", () => {
  for (const header of [undefined, "", "s3cret", "Basic c2VjcmV0"]) {
    const r = checkAdminAuth(req(header), () => "s3cret");
    assertStrictEquals(r.ok, false);
    if (!r.ok) assertStrictEquals(r.message, "invalid admin token");
  }
});

Deno.test("checkAdminAuth denies the wrong token", () => {
  const r = checkAdminAuth(req("Bearer wrong"), () => "s3cret");
  assertStrictEquals(r.ok, false);
});

Deno.test("checkAdminAuth accepts the configured Bearer token with a role", () => {
  const r = checkAdminAuth(req("Bearer s3cret"), () => "s3cret");
  assertStrictEquals(r.ok, true);
  if (!r.ok) throw new Error("unreachable");
  assertStrictEquals(r.role, "admin");
});

Deno.test("denyByCredentials camouflages anonymous as 404", async () => {
  const res = denyByCredentials(req(), "invalid session", "r-1");
  assertStrictEquals(res.status, 404);
  const b = await res.json() as { error: string; code: string };
  assertStrictEquals(b.error, "not found");
  assertStrictEquals(b.code, "NOT_FOUND");
});

Deno.test("denyByCredentials maps admin-only to 403, not 401", async () => {
  const authed = req("Bearer wrong");
  const res = denyByCredentials(authed, "admin only", "r-2");
  assertStrictEquals(res.status, 403);
  const b = await res.json() as { error: string; code: string };
  assertStrictEquals(b.code, "FORBIDDEN");
  const other = denyByCredentials(authed, "invalid session", "r-3");
  assertStrictEquals(other.status, 401);
});

Deno.test("denyDataAuth branches anonymous 404 vs credentialed 401", async () => {
  const anon = denyDataAuth(
    { ok: false, anonymous: true, message: "x" },
    "r-4",
  );
  assertStrictEquals(anon.status, 404);
  const authed = denyDataAuth(
    { ok: false, anonymous: false, message: "invalid session" },
    "r-5",
  );
  assertStrictEquals(authed.status, 401);
  const b = await authed.json() as { error: string };
  assertStrictEquals(b.error, "invalid session");
});

Deno.test("station scope fails closed for ungrouped non-admins", () => {
  assertStrictEquals(
    resolveAllowedLocationIds({
      role: "user",
      user: { allowedLocationIds: null },
    })?.length ?? -1,
    0,
  );
  assertStrictEquals(
    resolveAllowedLocationIds({
      role: "user",
      user: { allowedLocationIds: [] },
    })?.length ?? -1,
    0,
  );
  // Missing/malformed identity must never widen access.
  assertStrictEquals(
    resolveAllowedLocationIds({ role: "user", user: null })?.length ?? -1,
    0,
  );
  // Admins bypass station scoping.
  assertStrictEquals(
    resolveAllowedLocationIds({ role: "admin", user: null }),
    null,
  );
});

function sessionUser(
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    id: 1,
    email: "user@example.com",
    name: "User",
    phone: "",
    role: "user",
    active: true,
    allowedLocationIds: null,
    auth_source: "local",
    auth_method: "password",
    mustChangePassword: false,
    ...overrides,
  };
}

Deno.test("pendingPasswordChange holds only local session accounts", () => {
  const local: RequestAuth = {
    ok: true,
    role: "user",
    user: sessionUser({ mustChangePassword: true }),
    via: "session",
  };
  assertStrictEquals(pendingPasswordChange(local), true);

  const localCleared: RequestAuth = {
    ok: true,
    role: "user",
    user: sessionUser({ mustChangePassword: false }),
    via: "session",
  };
  assertStrictEquals(pendingPasswordChange(localCleared), false);

  // A stale flag on an Entra row must never trap the person on a screen with
  // no password to type.
  const entra: RequestAuth = {
    ok: true,
    role: "user",
    user: sessionUser({ auth_source: "entra", mustChangePassword: true }),
    via: "session",
  };
  assertStrictEquals(pendingPasswordChange(entra), false);

  // ADMIN_TOKEN carries no identity and stays exempt from the password gate.
  const token: RequestAuth = {
    ok: true,
    role: "admin",
    user: null,
    via: "token",
  };
  assertStrictEquals(pendingPasswordChange(token), false);

  const denied: RequestAuth = { ok: false, message: "invalid session" };
  assertStrictEquals(pendingPasswordChange(denied), false);
});

Deno.test("denyByCredentials answers 403 for a pending password change", async () => {
  const res = denyByCredentials(
    req("Bearer wrong"),
    PASSWORD_CHANGE_REQUIRED,
    "r-7",
  );
  assertStrictEquals(res.status, 403);
  const body = await res.json() as { error: string; code: string };
  assertStrictEquals(body.code, "PASSWORD_CHANGE_REQUIRED");
  assertStrictEquals(body.error, PASSWORD_CHANGE_REQUIRED);
});

Deno.test("denyDataAuth answers 403 for a pending password change", async () => {
  const res = denyDataAuth(
    { ok: false, anonymous: false, message: PASSWORD_CHANGE_REQUIRED },
    "r-8",
  );
  assertStrictEquals(res.status, 403);
  const body = await res.json() as { error: string; code: string };
  assertStrictEquals(body.code, "PASSWORD_CHANGE_REQUIRED");
});

Deno.test("authStoreUnavailable answers 503 with retry-after", async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  let res: Response;
  try {
    res = authStoreUnavailable("GET /api/x", new Error("db down"), "r-6");
  } finally {
    console.error = original;
  }
  assertStrictEquals(res!.status, 503);
  assertStrictEquals(res!.headers.get("retry-after"), "5");
  const b = await res!.json() as { code: string };
  assertStrictEquals(b.code, "UNAVAILABLE");
  assertStrictEquals(logged.length, 1);
});
