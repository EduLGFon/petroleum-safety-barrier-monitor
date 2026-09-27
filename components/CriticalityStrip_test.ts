// Unit tests for the criticality strip ordering (pure helper, no DOM).
import { assertEquals } from "jsr:@std/assert@^1";

import { orderRankEntries } from "./CriticalityStrip.tsx";

Deno.test("orderRankEntries puts canonical ranks first in ESO-A-B-C-D order", () => {
  assertEquals(
    orderRankEntries([["D", 1], ["B", 2], ["ESO", 3], ["C", 4], ["A", 5]]),
    [["ESO", 3], ["A", 5], ["B", 2], ["C", 4], ["D", 1]],
  );
});

Deno.test("orderRankEntries sorts novel ranks after by volume", () => {
  assertEquals(
    orderRankEntries([["Z-Nova", 9], ["A", 1], ["Outra", 3]]),
    [["A", 1], ["Z-Nova", 9], ["Outra", 3]],
  );
});
