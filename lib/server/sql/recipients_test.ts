// Unit tests for recipient validation (P5) - pure, no DB.
import { normalizeEmail, normalizeName, normalizePhone } from "./recipients.ts";

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

Deno.test("normalizePhone keeps empty, normalizes domestic numbers", () => {
  assertStrictEquals(normalizePhone(undefined), "");
  assertStrictEquals(normalizePhone(""), "");
  assertStrictEquals(normalizePhone("+55 27 99874-6290"), "5527998746290");
  assertStrictEquals(normalizePhone("27998746290"), "5527998746290");
});

Deno.test("normalizePhone rejects short numbers without area code", () => {
  for (const bad of ["998746290", "123", 42]) {
    let caught = false;
    try {
      normalizePhone(bad);
    } catch {
      caught = true;
    }
    assertStrictEquals(caught, true, String(bad));
  }
});
