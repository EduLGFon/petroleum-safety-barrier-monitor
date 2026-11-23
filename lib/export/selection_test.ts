// Unit tests for the export selection parser - the id list an export
// request carries, and the rule that keeps a selection honest.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { parseSelectionIds } from "./selection.ts";

import { EXPORT_MAX_ROWS } from "./limits.ts";

Deno.test("parseSelectionIds keeps only positive safe integers", () => {
  const parsed = parseSelectionIds([3, 1, 2]);
  assertStrictEquals(parsed.ids?.length, 3);
  assertStrictEquals(parsed.overCeiling, undefined);
  // Zero, negatives, fractions, huge numbers and non-numbers are dropped:
  // they are not barrier ids.
  const messy = parseSelectionIds([
    1,
    0,
    -2,
    1.5,
    Number.MAX_SAFE_INTEGER + 2,
    "7",
    null,
    true,
    { id: 9 },
  ]);
  assertStrictEquals(messy.ids?.length, 1);
  assertStrictEquals(messy.ids?.[0], 1);
});

Deno.test("parseSelectionIds dedupes the selection", () => {
  // The same row selected twice is one row: the count the route reports
  // must be the count of distinct rows.
  const parsed = parseSelectionIds([5, 5, 5, 7]);
  assertStrictEquals(parsed.ids?.length, 2);
  assertStrictEquals(parsed.ids?.[0], 5);
  assertStrictEquals(parsed.ids?.[1], 7);
});

Deno.test("parseSelectionIds reports a selection over the ceiling", () => {
  // Over the ceiling the selection is refused, never cut: a cut selection
  // would export a subset while the file claimed to cover the whole one.
  const many = Array.from({ length: EXPORT_MAX_ROWS + 1 }, (_, i) => i + 1);
  const parsed = parseSelectionIds(many);
  assertStrictEquals(parsed.ids, undefined);
  assertStrictEquals(parsed.overCeiling, EXPORT_MAX_ROWS + 1);
  // Duplicates do not count twice towards the ceiling.
  const dupes = Array.from(
    { length: EXPORT_MAX_ROWS + 50 },
    (_, i) => (i % EXPORT_MAX_ROWS) + 1,
  );
  const deduped = parseSelectionIds(dupes);
  assertStrictEquals(deduped.overCeiling, undefined);
  assertStrictEquals(deduped.ids?.length, EXPORT_MAX_ROWS);
});

Deno.test("parseSelectionIds treats an unusable body as the whole scope", () => {
  // A missing, malformed or empty selection means the whole filtered scope:
  // a bad body can never widen or narrow the export silently.
  assertStrictEquals(parseSelectionIds(undefined).ids, undefined);
  assertStrictEquals(parseSelectionIds("nope").ids, undefined);
  assertStrictEquals(parseSelectionIds({ ids: [1] }).ids, undefined);
  assertStrictEquals(parseSelectionIds([]).ids, undefined);
  assertStrictEquals(parseSelectionIds([0, -1, "x"]).ids, undefined);
  assertStrictEquals(parseSelectionIds([]).overCeiling, undefined);
});
