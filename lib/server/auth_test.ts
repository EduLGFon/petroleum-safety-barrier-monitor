// Unit tests for admin auth (P4) - fail-closed, Bearer only.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { checkAdminAuth } from "./auth.ts";

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
