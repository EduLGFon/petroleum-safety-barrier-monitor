// Unit tests for the response memo - budget sweep, no DB required.
import {
  evictOverBudget,
  MEMO_MAX_ENTRIES,
  memoGet,
  memoSet,
  scopeKey,
} from "./cache.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("evictOverBudget removes every key above the budget", () => {
  // The sweep must drop all the keys over the cap, not only the first one:
  // a single eviction per write leaves the rest of the over-budget keys in
  // the map.
  const entries = new Map<string, unknown>();
  for (let i = 0; i < 10; i++) entries.set(`k${i}`, i);
  evictOverBudget(entries, 4);
  assertStrictEquals(entries.size, 4);
  for (let i = 0; i < 6; i++) {
    assertStrictEquals(entries.has(`k${i}`), false, `k${i} must be evicted`);
  }
  // The newest entries survive.
  for (let i = 6; i < 10; i++) {
    assertStrictEquals(entries.has(`k${i}`), true, `k${i} must survive`);
  }

  // A map already inside the budget is left untouched.
  const small = new Map<string, unknown>([["only", 1]]);
  evictOverBudget(small, 4);
  assertStrictEquals(small.size, 1);
});

Deno.test("memoSet keeps the map inside the budget", () => {
  // Write far more keys than the budget allows: the memo must stay bounded
  // and keep the newest entries.
  for (let i = 0; i < MEMO_MAX_ENTRIES + 700; i++) {
    memoSet(`sweep-${i}`, { i });
  }
  assert(memoGet(`sweep-${MEMO_MAX_ENTRIES + 699}`, 60_000) !== undefined);
  assertStrictEquals(memoGet("sweep-0", 60_000), undefined);
});

Deno.test("memoSet overwrites an entry and scopeKey joins its parts", () => {
  memoSet("memo-key", { v: 1 });
  memoSet("memo-key", { v: 2 });
  const body = memoGet("memo-key", 60_000) as { v: number };
  assertStrictEquals(body.v, 2);
  assertStrictEquals(scopeKey(["kpi", 7, null, undefined]), "kpi|7|-|-");
});
