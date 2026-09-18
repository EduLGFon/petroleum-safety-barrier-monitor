// Unit tests for shared server validation normalizers.
import { assertStrictEquals, assertThrows } from "jsr:@std/assert@^1";

import { normalizeEmail, normalizeName } from "./validation.ts";

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
