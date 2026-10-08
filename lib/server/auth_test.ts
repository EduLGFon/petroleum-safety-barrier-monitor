// Unit tests for admin auth (P4) - fail-closed, Bearer only.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import {
  authStoreUnavailable,
  checkAdminAuth,
  denyByCredentials,
  denyDataAuth,
} from "./auth.ts";

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
