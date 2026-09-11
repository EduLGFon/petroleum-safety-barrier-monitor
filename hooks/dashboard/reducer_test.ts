// Unit tests for hooks/dashboard/reducer.ts - pure location/filter/sort transitions.
import { assertEquals } from "jsr:@std/assert@^1";
import { defaultFilters } from "../../lib/utils.ts";
import { reducer } from "./reducer.ts";
import type { State } from "./reducer.ts";

function state(over: Partial<State> = {}): State {
  return {
    location: "ALL",
    filters: defaultFilters(),
    ...over,
  };
}

Deno.test("SET_LOCATION sets location and resets page to 1", () => {
  const s = state({ filters: { ...defaultFilters(), page: 3 } });
  const next = reducer(s, { type: "SET_LOCATION", payload: "FAL" });
  assertEquals(next.location, "FAL");
  assertEquals(next.filters.page, 1);
});

Deno.test("SET_FILTER resets page to 1 when a real filter changed", () => {
  const s = state({ filters: { ...defaultFilters(), query: "x", page: 2 } });
  const next = reducer(s, { type: "SET_FILTER", payload: { query: "pump" } });
  assertEquals(next.filters.query, "pump");
  assertEquals(next.filters.page, 1);
});

Deno.test("SET_FILTER preserves the page on page-only navigation", () => {
  const next = reducer(state({ filters: { ...defaultFilters(), page: 4 } }), {
    type: "SET_FILTER",
    payload: { page: 5 },
  });
  assertEquals(next.filters.page, 5);
});

Deno.test("SET_SORT toggles asc->desc on repeat for the same column", () => {
  const s = state({
    filters: { ...defaultFilters(), sortCol: "id", sortDir: "asc" },
  });
  const once = reducer(s, { type: "SET_SORT", payload: "id" });
  assertEquals(once.filters.sortCol, "id");
  assertEquals(once.filters.sortDir, "desc");
  const twice = reducer(once, { type: "SET_SORT", payload: "id" });
  assertEquals(twice.filters.sortDir, "asc");
});

Deno.test("SET_SORT to a new column starts ascending", () => {
  const s = state({
    filters: { ...defaultFilters(), sortCol: "id", sortDir: "desc" },
  });
  const next = reducer(s, { type: "SET_SORT", payload: "statusSince" });
  assertEquals(next.filters.sortCol, "statusSince");
  assertEquals(next.filters.sortDir, "asc");
});

Deno.test("RESET_FILTERS returns fresh defaults", () => {
  const s = state({
    filters: {
      ...defaultFilters(),
      query: "x",
      categoria: "SIS",
      page: 9,
      sortCol: "statusSince",
      sortDir: "desc",
    },
  });
  const next = reducer(s, { type: "RESET_FILTERS" });
  assertEquals(next.filters, defaultFilters());
  assertEquals(next.location, "ALL");
});

Deno.test("RESTORE merges filters and location over current state", () => {
  const s = state({
    location: "FAL",
    filters: { ...defaultFilters(), page: 2 },
  });
  const next = reducer(s, {
    type: "RESTORE",
    payload: { location: "RPS-T1", query: "valve", page: 3 },
  });
  assertEquals(next.location, "RPS-T1");
  assertEquals(next.filters.query, "valve");
  assertEquals(next.filters.page, 3);
  assertEquals(next.filters.pageSize, 25);
});

Deno.test("RESTORE keeps location when payload omits it", () => {
  const next = reducer(
    state({ location: "CNC" }),
    { type: "RESTORE", payload: { query: "x" } },
  );
  assertEquals(next.location, "CNC");
});
