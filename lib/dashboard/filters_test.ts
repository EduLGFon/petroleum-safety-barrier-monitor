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

Deno.test("sanitizeFilterPatch keeps ISO dates and drops malformed ones", () => {
  const patch = sanitizeFilterPatch({ since: "2026-01-01", until: "nope" });
  assertEquals(patch, { since: "2026-01-01" });
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

Deno.test("applyFilters bounds statusSince by since/until", () => {
  const rows = [
    barrier({ id: 1, statusSince: "2026-01-01" }),
    barrier({ id: 2, statusSince: "2026-06-01" }),
  ];
  assertStrictEquals(
    applyFilters(rows, { ...defaultFilters(), since: "2026-03-01" }).length,
    1,
  );
  assertStrictEquals(
    applyFilters(rows, { ...defaultFilters(), until: "2026-03-01" }).length,
    1,
  );
  assertStrictEquals(
    applyFilters(rows, defaultFilters()).length,
    2,
  );
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

Deno.test("applyFilters splits on action-plan presence", () => {
  const rows = [
    barrier({ id: 1, actionPlan: "Trocar junta" }),
    barrier({ id: 2, actionPlan: "  " }),
  ];
  assertStrictEquals(
    applyFilters(rows, { ...defaultFilters(), plan: "Com plano" }).length,
    1,
  );
  assertStrictEquals(
    applyFilters(rows, { ...defaultFilters(), plan: "Sem plano" }).length,
    1,
  );
  assertStrictEquals(applyFilters(rows, defaultFilters()).length, 2);
});

Deno.test("sanitizeFilterPatch keeps plan values, drops unknown ones", () => {
  assertEquals(sanitizeFilterPatch({ plan: "Sem plano" }), {
    plan: "Sem plano",
  });
  assertEquals(sanitizeFilterPatch({ plan: "Talvez" }), {});
});
