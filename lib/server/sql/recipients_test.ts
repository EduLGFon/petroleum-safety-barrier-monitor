// Unit tests for recipient validation (P5) - pure, no DB.
import { normalizeEmail, normalizeName } from "./recipients.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("normalizeEmail lowercases, trims, accepts normal addresses", () => {
  assertStrictEquals(
    normalizeEmail("  Ops-Team@Example.COM "),
    "ops-team@example.com",
  );
});

Deno.test("normalizeEmail rejects non-addresses", () => {
  for (const bad of ["", "no-at", "a@b", "@x.y", "a b@c.d", 42, null]) {
    let caught = false;
    try {
      normalizeEmail(bad);
    } catch {
      caught = true;
    }
    assertStrictEquals(caught, true, String(bad));
  }
});

Deno.test("normalizeName trims, caps, defaults empty", () => {
  assertStrictEquals(normalizeName(undefined), "");
  assertStrictEquals(normalizeName("  Ana  "), "Ana");
  assertStrictEquals(normalizeName("x".repeat(500)).length, 200);
  let caught = false;
  try {
    normalizeName(7);
  } catch {
    caught = true;
  }
  assertStrictEquals(caught, true);
});
