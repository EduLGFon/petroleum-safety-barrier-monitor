// Unit tests for session cookies - token shape, parse, builders.
import {
  buildExpiredCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionTokenFromRequest,
  hashSessionToken,
} from "./session.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("session token hashes deterministically", async () => {
  const token = createSessionToken();
  assertStrictEquals(token.length, 64);
  const a = await hashSessionToken(token);
  const b = await hashSessionToken(token);
  assertStrictEquals(a, b);
  assertStrictEquals(a.length, 64);
});

Deno.test("cookie round-trips through the request parser", () => {
  const expires = new Date("2030-01-01T00:00:00Z");
  const set = buildSessionCookie("abc123", expires, false);
  const req = new Request("http://localhost/", { headers: { cookie: set } });
  assertStrictEquals(getSessionTokenFromRequest(req), "abc123");
});

Deno.test("expired cookie clears the session", () => {
  const cleared = buildExpiredCookie();
  assertStrictEquals(cleared.includes("Expires=Thu, 01 Jan 1970"), true);
});

Deno.test("missing cookie yields null", () => {
  const req = new Request("http://localhost/");
  assertStrictEquals(getSessionTokenFromRequest(req), null);
});
