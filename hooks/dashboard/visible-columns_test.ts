// Hook tests for hooks/dashboard/visible-columns.ts - defaults, restore,
// toggle/move/reset semantics through the linkedom renderHook harness.
import { DEFAULT_VISIBLE_COLS } from "../../components/table/columns.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { memoryStorage, renderHook } from "../../scripts/test-dom.ts";

import { useVisibleColumns } from "./visible-columns.ts";

import { STORE_KEY } from "./persistence.ts";

Deno.test("useVisibleColumns starts from defaults with empty storage", async () => {
  const hh = await renderHook(useVisibleColumns);
  const s = hh.get();
  assertEquals(s.visibleCols, [...DEFAULT_VISIBLE_COLS]);
  assertStrictEquals(s.hydratedCols, true);
});

Deno.test("useVisibleColumns restores a valid persisted order", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({ visibleCols: ["tag", "id", "nope"] }),
  });
  const hh = await renderHook(useVisibleColumns, { storage });
  assertEquals(hh.get().visibleCols, ["tag", "id"]);
});

Deno.test("useVisibleColumns falls back to defaults on corrupt storage", async () => {
  const storage = memoryStorage({ [STORE_KEY]: "{not json" });
  const hh = await renderHook(useVisibleColumns, { storage });
  assertEquals(hh.get().visibleCols, [...DEFAULT_VISIBLE_COLS]);
});

Deno.test("useVisibleColumns toggles and refuses to hide the last column", async () => {
  const hh = await renderHook(useVisibleColumns);
  await hh.rerender();
  // Hide one visible column, then show it back at its canonical slot.
  hh.get().toggleCol("category");
  await hh.rerender();
  assertEquals(hh.get().visibleCols.includes("category"), false);
  hh.get().toggleCol("category");
  await hh.rerender();
  assertEquals(hh.get().visibleCols.includes("category"), true);
  // Hiding everything but one is refused on the last toggle.
  const all = [...hh.get().visibleCols];
  for (const key of all.slice(0, -1)) {
    hh.get().toggleCol(key);
    await hh.rerender();
  }
  assertStrictEquals(hh.get().visibleCols.length, 1);
  const only = hh.get().visibleCols[0];
  if (only !== undefined) {
    hh.get().toggleCol(only);
    await hh.rerender();
  }
  assertStrictEquals(hh.get().visibleCols.length, 1);
});

Deno.test("useVisibleColumns moves columns and resets to defaults", async () => {
  const hh = await renderHook(useVisibleColumns);
  await hh.rerender();
  const first = hh.get().visibleCols;
  const second = first[1];
  const head = first[0];
  if (second !== undefined && head !== undefined) {
    hh.get().moveCol(second, -1);
    await hh.rerender();
    assertStrictEquals(hh.get().visibleCols[0], second);
    // Edge moves are no-ops.
    hh.get().moveCol(second, -1);
    await hh.rerender();
    assertStrictEquals(hh.get().visibleCols[0], second);
    assertStrictEquals(hh.get().visibleCols[1], head);
  }
  hh.get().resetCols();
  await hh.rerender();
  assertEquals(hh.get().visibleCols, [...DEFAULT_VISIBLE_COLS]);
});

Deno.test("useVisibleColumns toggles pinned filters and restores them", async () => {
  const hh = await renderHook(useVisibleColumns);
  await hh.rerender();
  assertEquals(hh.get().hiddenPinned, []);
  hh.get().togglePinned("plan");
  await hh.rerender();
  assertEquals(hh.get().hiddenPinned, ["plan"]);
  hh.get().togglePinned("dates");
  await hh.rerender();
  assertEquals(hh.get().hiddenPinned, ["plan", "dates"]);
  hh.get().togglePinned("plan");
  await hh.rerender();
  assertEquals(hh.get().hiddenPinned, ["dates"]);
  // Reset re-shows pinned filters too.
  hh.get().resetCols();
  await hh.rerender();
  assertEquals(hh.get().hiddenPinned, []);
});

Deno.test("useVisibleColumns restores persisted pinned filters, drops unknown", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({ hiddenPinned: ["dates", "nope", "dates"] }),
  });
  const hh = await renderHook(useVisibleColumns, { storage });
  assertEquals(hh.get().hiddenPinned, ["dates"]);
});
