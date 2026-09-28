// Hook tests for hooks/dashboard/filter-state.ts- location/filter/sort semantics,
// validated restore, and hydrated flag - through the linkedom renderHook harness.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { FILTER_DEFAULTS_VERSION } from "../../lib/utils.ts";

import { memoryStorage, renderHook } from "../../scripts/test-dom.ts";

import { useFilterState } from "./filter-state.ts";

import { STORE_KEY } from "./persistence.ts";

Deno.test("useFilterState starts from defaults and hydrates with empty storage", async () => {
  const hh = await renderHook(useFilterState);
  const f = hh.get();
  assertStrictEquals(f.location, "ALL");
  assertStrictEquals(f.hydrated, true);
  assertEquals(f.filters, {
    query: "",
    availability: "",
    compliance: "",
    category: "",
    typology: "",
    criticality: "",
    criticalOnly: false,
    plan: "",
    since: "",
    until: "",
    page: 1,
    pageSize: 25,
    sortCol: "id",
    sortDir: "asc",
  });
  assertStrictEquals(f.hasActiveFilters, false);
});

Deno.test("useFilterState restores a valid persisted dashboard", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      location: "RPS-T1",
      filters: { query: "pump" },
    }),
  });
  const hh = await renderHook(useFilterState, { storage });
  const f = hh.get();
  assertStrictEquals(f.location, "RPS-T1");
  assertStrictEquals(f.filters.query, "pump");
  assertStrictEquals(f.hydrated, true);
  assertStrictEquals(f.hasActiveFilters, true);
});

Deno.test("useFilterState falls back to defaults on corrupt JSON", async () => {
  const storage = memoryStorage({ [STORE_KEY]: "{not json" });
  const hh = await renderHook(useFilterState, { storage });
  const f = hh.get();
  assertStrictEquals(f.location, "ALL");
  assertStrictEquals(f.filters.page, 1);
  assertStrictEquals(f.hydrated, true);
});

Deno.test("useFilterState sanitizes garbage filter patches on restore", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      location: "FAL",
      filters: {
        query: "  skid  ",
        page: "abc",
        category: 7,
        sortDir: "sideways",
      },
    }),
  });
  const hh = await renderHook(useFilterState, { storage });
  const f = hh.get();
  assertStrictEquals(f.location, "FAL");
  assertStrictEquals(f.filters.query, "skid");
  assertStrictEquals(f.filters.category, "");
  assertStrictEquals(f.filters.page, 1);
  assertStrictEquals(f.filters.sortDir, "asc");
});

Deno.test("useFilterState drops the implicit gate from a v1 blob", async () => {
  // v1 shipped criticalOnly: true as a default, so restoring it verbatim would
  // pin the table to the critical tiers for every returning user.
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      filters: { criticalOnly: true, query: "psv" },
    }),
  });
  const hh = await renderHook(useFilterState, { storage });
  const f = hh.get();
  assertStrictEquals(f.filters.criticalOnly, false);
  assertStrictEquals(f.filters.query, "psv");
});

Deno.test("useFilterState keeps a gate the current version persisted", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      defaultsVersion: FILTER_DEFAULTS_VERSION,
      filters: { criticalOnly: true },
    }),
  });
  const hh = await renderHook(useFilterState, { storage });
  assertStrictEquals(hh.get().filters.criticalOnly, true);
});

Deno.test("useFilterState setFilter resets page except on page-only patches", async () => {
  const hh = await renderHook(useFilterState);
  await hh.rerender();
  hh.get().setFilter({ page: 2 });
  await hh.rerender();
  assertStrictEquals(hh.get().filters.page, 2);

  hh.get().setFilter({ query: "pump" });
  await hh.rerender();
  const f = hh.get();
  assertStrictEquals(f.filters.query, "pump");
  assertStrictEquals(f.filters.page, 1);

  hh.get().setFilter({ page: 3 });
  await hh.rerender();
  assertStrictEquals(hh.get().filters.page, 3);
});

Deno.test("useFilterState setSort toggles direction per column", async () => {
  const hh = await renderHook(useFilterState);
  hh.get().setSort("tag");
  await hh.rerender();
  assertStrictEquals(hh.get().filters.sortCol, "tag");
  assertStrictEquals(hh.get().filters.sortDir, "asc");
  hh.get().setSort("tag");
  await hh.rerender();
  assertStrictEquals(hh.get().filters.sortDir, "desc");
  hh.get().setSort("statusSince");
  await hh.rerender();
  assertStrictEquals(hh.get().filters.sortCol, "statusSince");
  assertStrictEquals(hh.get().filters.sortDir, "asc");
});

Deno.test("useFilterState setLocation updates location and resets page", async () => {
  const hh = await renderHook(useFilterState);
  hh.get().setFilter({ page: 4 });
  await hh.rerender();
  hh.get().setLocation("CNC");
  await hh.rerender();
  const f = hh.get();
  assertStrictEquals(f.location, "CNC");
  assertStrictEquals(f.filters.page, 1);
  assertStrictEquals(f.hasActiveFilters, true);
});

Deno.test("useFilterState showUrgent builds the NC-oldest-first scope", async () => {
  const hh = await renderHook(useFilterState);
  hh.get().setFilter({ query: "x", category: "SIS" });
  await hh.rerender();
  hh.get().showUrgent();
  await hh.rerender();
  const f = hh.get();
  assertStrictEquals(f.filters.compliance, "Não Conforme");
  assertStrictEquals(f.filters.query, "");
  assertStrictEquals(f.filters.category, "");
  assertStrictEquals(f.filters.availability, "");
  assertStrictEquals(f.filters.sortCol, "statusSince");
  assertStrictEquals(f.filters.sortDir, "asc");
  assertStrictEquals(f.filters.page, 1);
});

Deno.test("useFilterState resetFilters returns filters to defaults", async () => {
  const hh = await renderHook(useFilterState);
  hh.get().setFilter({ query: "pump" });
  await hh.rerender();
  hh.get().resetFilters();
  await hh.rerender();
  const f = hh.get();
  assertStrictEquals(f.filters.query, "");
  assertStrictEquals(f.filters.page, 1);
  assertStrictEquals(f.hasActiveFilters, false);
});
