// Pure tests for user batch helpers (no DB).
import { normalizeUserBatchAction, normalizeUserBatchIds } from "./users.ts";

import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { ValidationError } from "../validation.ts";

Deno.test("normalizeUserBatchIds dedupes and caps", () => {
  assertEquals(normalizeUserBatchIds([3, 1, 2, 1]), [3, 1, 2]);
});

Deno.test("normalizeUserBatchIds rejects non-positive and unsafe ids", () => {
  assertThrows(() => normalizeUserBatchIds([0]), ValidationError);
  assertThrows(() => normalizeUserBatchIds([-1]), ValidationError);
  assertThrows(() => normalizeUserBatchIds([1.5]), ValidationError);
  assertThrows(
    () => normalizeUserBatchIds([Number.MAX_SAFE_INTEGER + 1]),
    ValidationError,
  );
  assertThrows(() => normalizeUserBatchIds("nope" as unknown), ValidationError);
});

Deno.test("normalizeUserBatchIds rejects over 500 unique ids", () => {
  const ids = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() => normalizeUserBatchIds(ids), ValidationError);
  assertEquals(normalizeUserBatchIds(new Array(501).fill(7)), [7]);
});

Deno.test("normalizeUserBatchAction accepts only canonical actions", () => {
  assertEquals(normalizeUserBatchAction("activate"), "activate");
  assertEquals(normalizeUserBatchAction("deactivate"), "deactivate");
  assertEquals(normalizeUserBatchAction("promote"), "promote");
  assertEquals(normalizeUserBatchAction("demote"), "demote");
  assertEquals(normalizeUserBatchAction("revokeSessions"), "revokeSessions");
});

Deno.test("normalizeUserBatchAction rejects aliases and unknown values", () => {
  assertThrows(() => normalizeUserBatchAction("Ativar"), ValidationError);
  assertThrows(
    () => normalizeUserBatchAction("revoke-sessions"),
    ValidationError,
  );
  assertThrows(() => normalizeUserBatchAction("Rebaixar"), ValidationError);
  assertThrows(() => normalizeUserBatchAction("foo"), ValidationError);
});
