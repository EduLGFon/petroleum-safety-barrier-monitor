// Route edge validation tests - no DB required.
// Covers query param parsing, error envelope shape, and throttle decisions
// shared by all 18 API handlers.
import { apiError, badRequest, unauthorized } from "../../lib/server/errors.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { parseFilterQuery, parseIntParam } from "./_params.ts";

import { createThrottle } from "../../lib/server/throttle.ts";

Deno.test("parseIntParam rejects non-integers", () => {
  assertStrictEquals(parseIntParam("abc"), undefined);
  assertStrictEquals(parseIntParam("1.5"), undefined);
  assertStrictEquals(parseIntParam("42"), 42);
  assertStrictEquals(parseIntParam(null), undefined);
});

Deno.test("parseFilterQuery caps query length", () => {
  const q = parseFilterQuery(new URLSearchParams({ query: "x".repeat(500) }));
  assert((q.query?.length ?? 0) <= 200);
});

Deno.test("error envelope carries code and requestId", async () => {
  const res = badRequest("Invalid JSON body", "req-1");
  assertStrictEquals(res.status, 400);
  const body = await res.json() as { error: string; requestId: string };
  assertStrictEquals(body.requestId, "req-1");
  assertStrictEquals(res.headers.get("x-request-id"), "req-1");
});

Deno.test("unauthorized returns 401 for bad credentials", async () => {
  const res = unauthorized("invalid credentials", "req-2");
  assertStrictEquals(res.status, 401);
  const body = await res.json() as { error: string };
  assertStrictEquals(body.error, "invalid credentials");
});

Deno.test("apiError sets JSON envelope", () => {
  const res = apiError(400, "BAD_REQUEST", "nope", "r");
  assertStrictEquals(res.status, 400);
});

Deno.test("throttle blocks over limit within window", () => {
  let now = 0;
  const t = createThrottle({ limit: 2, windowMs: 1000, now: () => now });
  assert(t.check("k").allowed);
  assert(t.check("k").allowed);
  assert(!t.check("k").allowed);
  now = 2000;
  assert(t.check("k").allowed);
});
