// Pure tests for alert rule batch helpers (no DB).
import {
  MAX_ALERT_RULE_BATCH_IDS,
  normalizeAlertRuleBatchAction,
  normalizeAlertRuleBatchIds,
} from "./alert_rules.ts";

import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { ValidationError } from "../validation.ts";

Deno.test("normalizeAlertRuleBatchIds dedupes and sorts", () => {
  assertEquals(normalizeAlertRuleBatchIds([3, 1, 2, 2]), [1, 2, 3]);
});

Deno.test("normalizeAlertRuleBatchIds rejects empty/non-positive/non-integer", () => {
  assertThrows(() => normalizeAlertRuleBatchIds([]), ValidationError);
  assertThrows(() => normalizeAlertRuleBatchIds([0]), ValidationError);
  assertThrows(() => normalizeAlertRuleBatchIds([-1]), ValidationError);
  assertThrows(() => normalizeAlertRuleBatchIds([1.5]), ValidationError);
  assertThrows(
    () => normalizeAlertRuleBatchIds([Number.MAX_SAFE_INTEGER + 1]),
    ValidationError,
  );
  assertThrows(
    () => normalizeAlertRuleBatchIds("x" as unknown),
    ValidationError,
  );
});

Deno.test("normalizeAlertRuleBatchIds dedupes before the max cap", () => {
  assertEquals(
    normalizeAlertRuleBatchIds(new Array(MAX_ALERT_RULE_BATCH_IDS + 1).fill(5)),
    [5],
  );
});

Deno.test("normalizeAlertRuleBatchIds enforces max 500 unique ids", () => {
  const big = Array.from(
    { length: MAX_ALERT_RULE_BATCH_IDS + 1 },
    (_, i) => i + 1,
  );
  assertThrows(() => normalizeAlertRuleBatchIds(big), ValidationError);
  assertEquals(
    normalizeAlertRuleBatchIds(Array.from({ length: 2 }, (_, i) => i + 1))
      .length,
    2,
  );
});

Deno.test("normalizeAlertRuleBatchAction validates", () => {
  assertEquals(normalizeAlertRuleBatchAction("activate"), "activate");
  assertEquals(normalizeAlertRuleBatchAction("deactivate"), "deactivate");
  assertEquals(normalizeAlertRuleBatchAction("delete"), "delete");
  assertThrows(
    () => normalizeAlertRuleBatchAction("nope"),
    ValidationError,
  );
  assertThrows(() => normalizeAlertRuleBatchAction(1), ValidationError);
});
