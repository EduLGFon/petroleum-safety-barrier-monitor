// Unit tests for page auth gates - camouflage, redirects, safe return targets.
// This is why they exist: Login => Dashboard must fail closed without a
// database, so every pure helper here is pinned by tests (session row
// lookups stay in DB-backed integration coverage).
import { camouflage, safeNext, toLogin } from "./page-auth.ts";
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { hasCredentials } from "./auth.ts";

function req(init?: { cookie?: string; auth?: string }): Request {
  const headers: Record<string, string> = {};
  if (init?.cookie) headers["cookie"] = init.cookie;
  if (init?.auth) headers["authorization"] = init.auth;
  return new Request("http://localhost/", { headers });
}

Deno.test("hasCredentials is false only for bare requests", () => {
  assertStrictEquals(hasCredentials(req()), false);
  assertStrictEquals(
    hasCredentials(req({ cookie: "barrier_session=abc" })),
    true,
  );
  assertStrictEquals(hasCredentials(req({ auth: "Bearer x" })), true);
});

Deno.test("safeNext keeps same-origin paths and falls back otherwise", () => {
  assertStrictEquals(safeNext(null), "/");
  assertStrictEquals(safeNext("/"), "/");
  assertStrictEquals(safeNext("/?x=1"), "/?x=1");
  assertStrictEquals(safeNext("/admin"), "/admin");
  assertStrictEquals(safeNext("//evil.com"), "/");
  assertStrictEquals(safeNext("https://evil.com/"), "/");
  assertStrictEquals(safeNext("javascript:alert(1)"), "/");
  assertStrictEquals(safeNext("/\\evil"), "/");
  assertStrictEquals(safeNext(""), "/");
});

Deno.test("camouflage is a bare 404 with no product hints", async () => {
  const res = camouflage();
  assertStrictEquals(res.status, 404);
  assertStrictEquals(await res.text(), "Not Found");
});

Deno.test("toLogin preserves path and query as next", () => {
  const res = toLogin(new URL("http://localhost/admin?tab=users"));
  assertStrictEquals(res.status, 302);
  assertStrictEquals(
    res.headers.get("location"),
    "http://localhost/login?next=%2Fadmin%3Ftab%3Dusers",
  );
});
