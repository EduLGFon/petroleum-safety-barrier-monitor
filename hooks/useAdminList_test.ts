// Unit tests for the pure paging/filter/selection helpers in useAdminList.
// Why it exists: these helpers define the list contract later admin pages
// share, so they are verified without a DOM or network.
import {
  filterByQuery,
  pageSlice,
  pruneKeys,
  toggleKey,
} from "./useAdminList.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

const rows = [
  { id: 1, text: "Alpha" },
  { id: 2, text: "beta" },
  { id: 3, text: "GAMMA" },
];

Deno.test("filterByQuery matches case-insensitively and trims the query", () => {
  assertEquals(
    filterByQuery(rows, "  BeT ", (row) => row.text).map((row) => row.id),
    [2],
  );
});

Deno.test("filterByQuery returns the original list for an empty query", () => {
  assertStrictEquals(filterByQuery(rows, "   ", (row) => row.text), rows);
});

Deno.test("pageSlice clamps the page to the last page", () => {
  assertEquals(
    pageSlice([1, 2, 3, 4, 5], 99, 2),
    [5],
  );
  assertEquals(pageSlice([1, 2, 3, 4, 5], 2, 2), [3, 4]);
});

Deno.test("pageSlice handles empty lists and zero page", () => {
  assertEquals(pageSlice([], 0, 25), []);
});

Deno.test("toggleKey adds and removes without mutating the original", () => {
  const start = new Set([1]);
  const added = toggleKey(start, 2);
  assertEquals([...added], [1, 2]);
  assertEquals([...start], [1]);
  assertEquals([...toggleKey(added, 1)], [2]);
});

Deno.test("pruneKeys keeps only ids that still exist", () => {
  assertEquals(
    [...pruneKeys(new Set([1, 2, 3]), [3, 4])],
    [3],
  );
  assertEquals(
    [...pruneKeys(new Set(["a", "b"]), new Set(["b"]))],
    ["b"],
  );
});
