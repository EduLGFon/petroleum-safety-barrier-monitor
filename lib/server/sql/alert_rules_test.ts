// Pure tests for alert rule batch helpers (no DB).
import {
  MAX_ALERT_RULE_BATCH_IDS,
  normalizeAlertRuleBatchAction,
  normalizeAlertRuleBatchIds,
} from "./alert_rules.ts";

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { ValidationError } from "../validation.ts";

import { listAlertRules } from "./alert_rules.ts";

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

// Pagination tests for listAlertRules - DB-free via a pool stub.
function installPool(
  respond: (text: string, args: unknown[]) => { rows: unknown[] },
): () => void {
  const globals = globalThis as unknown as { __barrierPool?: unknown };
  const previous = globals.__barrierPool;
  globals.__barrierPool = {
    connect: () =>
      Promise.resolve({
        queryObject: (text: string, args: unknown[] = []) =>
          Promise.resolve(respond(text, args)),
        release: () => {},
      }),
    end: () => Promise.resolve(),
  };
  return () => {
    globals.__barrierPool = previous;
  };
}

Deno.test("listAlertRules passes limit and offset to the query", async () => {
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const restore = installPool((text, args) => {
    seen.push({ text, args });
    return { rows: [] };
  });
  try {
    await listAlertRules(false, 5, 10);
    const query = seen.find((q) => q.text.includes("from alert_rules"));
    assertEquals(query?.args, [5, 10]);
    assert(query?.text.includes("limit $"), "limit placeholder");
    assert(query?.text.includes("offset $"), "offset placeholder");
  } finally {
    restore();
  }
});

Deno.test("listAlertRules without pagination keeps the unbounded query", async () => {
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const restore = installPool((text, args) => {
    seen.push({ text, args });
    return { rows: [] };
  });
  try {
    await listAlertRules();
    const query = seen.find((q) => q.text.includes("from alert_rules"));
    assertEquals(query?.args, []);
    assert(!query?.text.includes("limit"), "no limit clause");
  } finally {
    restore();
  }
});
