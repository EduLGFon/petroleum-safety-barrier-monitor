// Unit tests for shared server validation normalizers.
import {
  normalizeEmail,
  normalizeName,
  normalizeOptionalReference,
  normalizePhone,
  parsePositiveId,
  POSTGRES_UNIQUE_VIOLATION,
  postgresErrorInfo,
  readJsonBodyCapped,
  ValidationError,
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
  for (const bad of ["", "no-at", "a@b", "@x.y", "a b@c.d", "not-an-email"]) {
    assertThrows(() => normalizeEmail(bad), Error, "invalid email");
  }
  assertThrows(() => normalizeEmail(42), Error, "must be a string");
  assertThrows(() => normalizeEmail(null), Error, "must be a string");
});

Deno.test("normalizeName trims and caps", () => {
  assertStrictEquals(normalizeName(null), "");
  assertStrictEquals(normalizeName(undefined), "");
  assertStrictEquals(normalizeName("  Ana  "), "Ana");
  assertStrictEquals(normalizeName("x".repeat(500)).length, 200);
  assertThrows(() => normalizeName(42), Error, "must be a string");
  assertThrows(() => normalizeName(7), Error, "must be a string");
});

Deno.test("normalizePhone keeps empty, normalizes domestic numbers", () => {
  assertStrictEquals(normalizePhone(undefined), "");
  assertStrictEquals(normalizePhone(""), "");
  assertStrictEquals(normalizePhone(null), "");
  assertStrictEquals(normalizePhone("+55 27 99874-6290"), "5527998746290");
  assertStrictEquals(normalizePhone("27998746290"), "5527998746290");
});

Deno.test("normalizePhone rejects short numbers without area code", () => {
  for (const bad of ["998746290", "123", 42, "a"]) {
    let caught = false;
    try {
      normalizePhone(bad);
    } catch {
      caught = true;
    }
    assertStrictEquals(caught, true, String(bad));
  }
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

Deno.test("normalizers reject with a typed ValidationError", () => {
  // The type is what lets a route answer 400 without matching error text.
  assertThrows(() => normalizeEmail(42), ValidationError, "must be a string");
  assertThrows(
    () => normalizeEmail("not-an-email"),
    ValidationError,
    "invalid email",
  );
  assertThrows(() => normalizeName(42), ValidationError, "must be a string");
  assertThrows(
    () => normalizePhone(42),
    ValidationError,
    "must be a string",
  );
  assertThrows(
    () => normalizeOptionalReference(42, "ref"),
    ValidationError,
    "must be a string",
  );
  assertThrows(
    () => parsePositiveId(0, "id"),
    ValidationError,
    "positive integer",
  );
  // A ValidationError is still an Error, so existing handlers keep working.
  assertThrows(() => normalizeEmail(42), Error, "must be a string");
});

Deno.test("postgresErrorInfo reads the driver fields, never the message", () => {
  // The driver reports the SQLSTATE and the violated constraint; the route
  // classifies on those, so wording can never decide the status code.
  type DriverError = {
    fields: { code: string; constraint: string };
    message: string;
  };
  const unique: DriverError = {
    fields: { code: POSTGRES_UNIQUE_VIOLATION, constraint: "users_email_key" },
    message: 'duplicate key value violates unique constraint "users_email_key"',
  };
  const info = postgresErrorInfo(unique);
  assertStrictEquals(info.code, POSTGRES_UNIQUE_VIOLATION);
  assertStrictEquals(info.constraint, "users_email_key");

  // An error that merely mentions a known word is not a unique violation.
  const other: DriverError = {
    fields: { code: "23503", constraint: "barriers_location_id_fkey" },
    message: "email must be unique",
  };
  const otherInfo = postgresErrorInfo(other);
  assert(otherInfo.code !== POSTGRES_UNIQUE_VIOLATION);
  assertStrictEquals(otherInfo.code, "23503");

  // Anything that is not a driver error yields no fields at all.
  assertStrictEquals(postgresErrorInfo(new Error("boom")).code, undefined);
  assertStrictEquals(postgresErrorInfo("boom").constraint, undefined);
  assertStrictEquals(postgresErrorInfo(null).code, undefined);
  assertStrictEquals(postgresErrorInfo(undefined).code, undefined);
});
