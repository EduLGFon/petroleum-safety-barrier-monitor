// Unit tests for lib/dashboard/filters.ts - sanitizers and pipeline.
import {
  applyFilters,
  applySorting,
  defaultFilters,
  paginate,
  sanitizeFilterPatch,
  sanitizeFilters,
} from "./filters.ts";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { Barrier } from "../types.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "PSV-1-FAL",
    typology: "Tip",
    location: "FAL",
    locDesc: "Rig",
    criticality: "Não Crítica",
    category: "Cat",
    grouping: "Ag",
    owner: "",
    availability: "Disponível",
    compliance: "Conforme",
    comments: "",
    actionPlan: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

Deno.test("sanitizeFilterPatch drops malformed keys only", () => {
  const patch = sanitizeFilterPatch({
    query: "  abc  ",
    page: "5",
    pageSize: 999,
    sortCol: "hacker",
    sortDir: "sideways",
    availability: 42,
  });
  assertEquals(patch, { query: "abc" });
});

Deno.test("sanitizeFilterPatch keeps well-formed values", () => {
  const patch = sanitizeFilterPatch({
    query: "fal",
    page: 3,
    pageSize: 50,
    sortCol: "tag",
    sortDir: "desc",
  });
  assertEquals(patch, {
    query: "fal",
    page: 3,
    pageSize: 50,
    sortCol: "tag",
    sortDir: "desc",
  });
});

Deno.test("sanitizeFilters always returns a complete state", () => {
  const f = sanitizeFilters(null);
  assertEquals(f, defaultFilters());
  const g = sanitizeFilters({ page: 2 });
  assertStrictEquals(g.page, 2);
  assertStrictEquals(g.sortCol, "id");
});

Deno.test("applyFilters matches query case-insensitively", () => {
  const rows = [barrier(), barrier({ id: 2, tag: "OT-9-CNC" })];
  const f = { ...defaultFilters(), query: "psv-1" };
  assertStrictEquals(applyFilters(rows, f).length, 1);
});

Deno.test("applySorting orders ids numerically and copies input", () => {
  const rows = [barrier({ id: 9 }), barrier({ id: 2 })];
  const sorted = applySorting(rows, { ...defaultFilters(), sortCol: "id" });
  assertEquals(sorted.map((b) => b.id), [2, 9]);
  assertEquals(rows.map((b) => b.id), [9, 2]);
});

Deno.test("paginate returns empty past the last page", () => {
  assertEquals(paginate([barrier()], 5, 25), []);
  assert(paginate([barrier()], 1, 25).length === 1);
});
