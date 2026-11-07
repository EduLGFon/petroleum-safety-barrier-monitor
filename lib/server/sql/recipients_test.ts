// Unit tests for recipient batch id validation (pure, no DB).
import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { validateRecipientIds } from "./recipients.ts";

Deno.test("validateRecipientIds accepts and dedupes positive ids", () => {
  assertEquals(validateRecipientIds([3, 1, 3]), [3, 1]);
});

Deno.test("validateRecipientIds rejects empty, oversized, and bad values", () => {
  assertThrows(() => validateRecipientIds([]));
  assertThrows(() => validateRecipientIds([0]));
  assertThrows(() => validateRecipientIds([1.5]));
  assertThrows(() => validateRecipientIds("no" as unknown));
  const big = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => validateRecipientIds(big));
});
