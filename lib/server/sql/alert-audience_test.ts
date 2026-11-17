// Pure tests for the alert audience row mapper (no DB).
import {
  type AlertAudienceRow,
  audienceRowToRecipient,
} from "./alert-audience.ts";

import { assertEquals } from "jsr:@std/assert@^1";

function row(over: Partial<AlertAudienceRow> = {}): AlertAudienceRow {
  return {
    id: 1,
    email: "user@example.com",
    name: "User",
    phone: "5527999999999",
    role: "user",
    location_ids: [1],
    ...over,
  };
}

Deno.test("admin row maps to an unrestricted scope", () => {
  assertEquals(
    audienceRowToRecipient(row({ role: "admin", location_ids: [1, 2] })),
    {
      email: "user@example.com",
      name: "User",
      phone: "5527999999999",
      locationIds: null,
    },
  );
});

Deno.test("non-admin row maps to its station union", () => {
  assertEquals(
    audienceRowToRecipient(row({ location_ids: [3, 4] })),
    {
      email: "user@example.com",
      name: "User",
      phone: "5527999999999",
      locationIds: [3, 4],
    },
  );
});

Deno.test("non-admin without a group maps to an empty scope", () => {
  assertEquals(
    audienceRowToRecipient(row({ location_ids: null })),
    {
      email: "user@example.com",
      name: "User",
      phone: "5527999999999",
      locationIds: [],
    },
  );
});
