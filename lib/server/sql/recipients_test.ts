// Unit tests for recipient batch id validation (pure, no DB).
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@^1";

import { batchRecipients, validateRecipientIds } from "./recipients.ts";

import { ValidationError } from "../validation.ts";

Deno.test("validateRecipientIds accepts and dedupes positive ids", () => {
  assertEquals(validateRecipientIds([3, 1, 3]), [3, 1]);
});

Deno.test("validateRecipientIds rejects empty, oversized, and bad values", () => {
  assertThrows(() => validateRecipientIds([]), ValidationError);
  assertThrows(() => validateRecipientIds([0]), ValidationError);
  assertThrows(() => validateRecipientIds([1.5]), ValidationError);
  assertThrows(
    () => validateRecipientIds([Number.MAX_SAFE_INTEGER + 1]),
    ValidationError,
  );
  assertThrows(
    () => validateRecipientIds("no" as unknown),
    ValidationError,
  );
  const big = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => validateRecipientIds(big), ValidationError);
});

Deno.test("validateRecipientIds dedupes before the max cap", () => {
  assertEquals(validateRecipientIds(new Array(501).fill(7)), [7]);
  const distinct = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => validateRecipientIds(distinct), ValidationError);
});

Deno.test("batchRecipients accepts the four canonical actions", async () => {
  for (const action of ["activate", "deactivate", "delete"]) {
    await assertRejects(
      () => batchRecipients(action, []),
      ValidationError,
    );
  }
  await assertRejects(
    () => batchRecipients("addUsers", undefined, []),
    ValidationError,
  );
});

Deno.test("batchRecipients rejects unknown action", async () => {
  await assertRejects(() => batchRecipients("nope", [1]), ValidationError);
});
