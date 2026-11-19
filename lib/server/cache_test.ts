// Unit tests for the response memo - budget sweep, no DB required.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { memoGet, memoSet, scopeKey } from "./cache.ts";

Deno.test("memoSet keeps the map inside the budget", () => {
  // Write far more keys than the budget allows: the sweep must remove every
  // key above the cap, not only the first one, so the map stays bounded.
  for (let i = 0; i < 1200; i++) {
    memoSet(`sweep-${i}`, { i });
  }
  // The newest key is still readable.
  assert(memoGet("sweep-1199", 60_000) !== undefined);
  // The oldest ones were evicted to stay inside the budget.
  assertStrictEquals(memoGet("sweep-0", 60_000), undefined);
});

Deno.test("memoSet overwrites an entry and scopeKey joins its parts", () => {
  memoSet("memo-key", { v: 1 });
  memoSet("memo-key", { v: 2 });
  const body = memoGet("memo-key", 60_000) as { v: number };
  assertStrictEquals(body.v, 2);
  assertStrictEquals(scopeKey(["kpi", 7, null, undefined]), "kpi|7|-|-");
});
