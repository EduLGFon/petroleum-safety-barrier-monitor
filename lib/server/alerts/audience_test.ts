// Unit tests for the alert audience scope filter (no DB).
import { recipientsForLocation } from "./audience.ts";

import { assertEquals } from "jsr:@std/assert@^1";

const admin = { email: "admin@example.com", locationIds: null };
const stationOne = { email: "one@example.com", locationIds: [1] };
const stationTwo = { email: "two@example.com", locationIds: [2] };
const noGroup = { email: "none@example.com", locationIds: [] };

function emails(
  recipients: Array<{ email: string }>,
): string[] {
  return recipients.map((recipient) => recipient.email);
}

Deno.test("admin scope receives every station", () => {
  assertEquals(emails(recipientsForLocation([admin], 1)), [
    "admin@example.com",
  ]);
  assertEquals(emails(recipientsForLocation([admin], 2)), [
    "admin@example.com",
  ]);
  assertEquals(emails(recipientsForLocation([admin], null)), [
    "admin@example.com",
  ]);
});

Deno.test("non-admin scope receives only matching stations", () => {
  const audience = [stationOne, stationTwo];
  assertEquals(emails(recipientsForLocation(audience, 1)), [
    "one@example.com",
  ]);
  assertEquals(emails(recipientsForLocation(audience, 2)), [
    "two@example.com",
  ]);
  assertEquals(emails(recipientsForLocation(audience, 3)), []);
});

Deno.test("non-admin without a group receives nothing", () => {
  assertEquals(emails(recipientsForLocation([noGroup], 1)), []);
  assertEquals(emails(recipientsForLocation([noGroup], null)), []);
});

Deno.test("unknown station reaches only unrestricted recipients", () => {
  const audience = [admin, stationOne, noGroup];
  assertEquals(emails(recipientsForLocation(audience, null)), [
    "admin@example.com",
  ]);
  assertEquals(emails(recipientsForLocation(audience, undefined)), [
    "admin@example.com",
  ]);
});

Deno.test("empty emails are dropped even when unrestricted", () => {
  const audience = [
    { email: "", locationIds: null },
    { email: "   ", locationIds: null },
    { email: "valid@example.com", locationIds: [1] },
  ];
  assertEquals(emails(recipientsForLocation(audience, 1)), [
    "valid@example.com",
  ]);
});
