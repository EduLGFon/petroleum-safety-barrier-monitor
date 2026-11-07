// Pure tests for alert rule batch helpers (no DB).
import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import {
  MAX_ALERT_RULE_BATCH_IDS,
  normalizeAlertRuleBatchAction,
  normalizeAlertRuleBatchIds,
} from "./alert_rules.ts";

Deno.test("normalizeAlertRuleBatchIds dedupes and sorts", () => {
  assertEquals(normalizeAlertRuleBatchIds([3, 1, 2, 2]), [1, 2, 3]);
});

Deno.test("normalizeAlertRuleBatchIds rejects empty/non-positive/non-integer", () => {
  assertThrows(() => normalizeAlertRuleBatchIds([]));
  assertThrows(() => normalizeAlertRuleBatchIds([0]));
  assertThrows(() => normalizeAlertRuleBatchIds([-1]));
  assertThrows(() => normalizeAlertRuleBatchIds([1.5]));
  assertThrows(() => normalizeAlertRuleBatchIds("x" as unknown));
});

Deno.test("normalizeAlertRuleBatchIds enforces max 500", () => {
  const big = Array.from(
    { length: MAX_ALERT_RULE_BATCH_IDS + 1 },
    (_, i) => i + 1,
  );
  assertThrows(() => normalizeAlertRuleBatchIds(big));
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
  assertThrows(() => normalizeAlertRuleBatchAction("nope"));
  assertThrows(() => normalizeAlertRuleBatchAction(1));
});
