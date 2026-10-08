// Unit tests for shared server validation normalizers.
import { assert, assertStrictEquals, assertThrows } from "jsr:@std/assert@^1";

import { normalizeEmail, normalizeName } from "./validation.ts";

import { parseIdParam, readJsonBody } from "./validation.ts";

Deno.test("normalizeEmail trims and lowercases", () => {
  assertStrictEquals(
    normalizeEmail("  Admin@Example.com  "),
    "admin@example.com",
  );
});

Deno.test("normalizeEmail rejects invalid input", () => {
  assertThrows(() => normalizeEmail("not-an-email"), Error, "invalid email");
  assertThrows(() => normalizeEmail(42), Error, "must be a string");
});

Deno.test("normalizeName trims and caps", () => {
  assertStrictEquals(normalizeName(null), "");
  assertStrictEquals(normalizeName("  Ana  "), "Ana");
  assertThrows(() => normalizeName(42), Error, "must be a string");
});

Deno.test("parseIdParam accepts positive safe integers only", () => {
  assertStrictEquals(parseIdParam("42"), 42);
  assertStrictEquals(parseIdParam("1"), 1);
  assertStrictEquals(parseIdParam("abc"), undefined);
  assertStrictEquals(parseIdParam("1.5"), undefined);
  assertStrictEquals(parseIdParam("0"), undefined);
  assertStrictEquals(parseIdParam("-3"), undefined);
  assertStrictEquals(parseIdParam(""), undefined);
  assertStrictEquals(parseIdParam(undefined), undefined);
});

Deno.test("readJsonBody parses objects, rejects the rest", async () => {
  const good = await readJsonBody(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    }),
  );
  assert(good.ok && good.body.a === 1);
  assertStrictEquals(
    (await readJsonBody(
      new Request("http://x", { method: "POST", body: "not json{" }),
    )).ok,
    false,
  );
  assertStrictEquals(
    (await readJsonBody(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify([1, 2]),
      }),
    )).ok,
    false,
  );
});
