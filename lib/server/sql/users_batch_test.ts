// Pure tests for user batch helpers (no DB).
import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { normalizeUserBatchAction, normalizeUserBatchIds } from "./users.ts";

Deno.test("normalizeUserBatchIds dedupes and caps", () => {
  assertEquals(normalizeUserBatchIds([3, 1, 2, 1]), [3, 1, 2]);
});

Deno.test("normalizeUserBatchIds rejects non-positive", () => {
  assertThrows(() => normalizeUserBatchIds([0]), Error);
  assertThrows(() => normalizeUserBatchIds([-1]), Error);
  assertThrows(() => normalizeUserBatchIds([1.5]), Error);
});

Deno.test("normalizeUserBatchIds rejects over 500", () => {
  const ids = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => normalizeUserBatchIds(ids), Error);
});

Deno.test("normalizeUserBatchAction canonicalizes aliases", () => {
  assertEquals(normalizeUserBatchAction("Ativar"), "activate");
  assertEquals(normalizeUserBatchAction("revoke-sessions"), "revokeSessions");
  assertEquals(normalizeUserBatchAction("Rebaixar"), "demote");
});

Deno.test("normalizeUserBatchAction rejects unknown", () => {
  assertThrows(() => normalizeUserBatchAction("foo"), Error);
});
