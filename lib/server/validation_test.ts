// Unit tests for shared server validation normalizers.
import {
  normalizeEmail,
  normalizeName,
  normalizeOptionalReference,
  parsePositiveId,
  readJsonBodyCapped,
} from "./validation.ts";

import { assert, assertStrictEquals, assertThrows } from "jsr:@std/assert@^1";

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

Deno.test("contingency inputs validate ids and optional references", () => {
  assertStrictEquals(parsePositiveId(42, "id"), 42);
  assertThrows(() => parsePositiveId(0, "id"), Error, "positive integer");
  assertThrows(() => parsePositiveId("42", "id"), Error, "positive integer");
  assertStrictEquals(normalizeOptionalReference(undefined, "ref"), "");
  assertStrictEquals(normalizeOptionalReference("  GM-12 ", "ref"), "GM-12");
  assertThrows(
    () => normalizeOptionalReference("x".repeat(2001), "ref"),
    Error,
    "too long",
  );
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

Deno.test("readJsonBodyCapped rejects invalid and oversized request bodies", async () => {
  const good = await readJsonBodyCapped(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ ref: "GM-12" }),
    }),
    100,
  );
  assert(good.ok && good.body.ref === "GM-12");
  const tooLarge = await readJsonBodyCapped(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ ref: "x".repeat(100) }),
    }),
    20,
  );
  assertStrictEquals(tooLarge.ok, false);
  if (!tooLarge.ok) assertStrictEquals(tooLarge.reason, "too-large");
});
