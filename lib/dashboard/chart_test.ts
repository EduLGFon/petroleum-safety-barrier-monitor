// Unit tests for lib/dashboard/chart.ts - per-category Conforme/NC buckets.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { computeChartData } from "./chart.ts";

import type { Barrier } from "../types.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "T-1",
    typology: "Tip",
    location: "FAL",
    locDesc: "Rig",
    criticality: "Não Crítica",
    category: "Cat A",
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

Deno.test("computeChartData groups and sorts biggest-first", () => {
  const rows = computeChartData([
    barrier({ category: "Small", compliance: "Conforme" }),
    barrier({ id: 2, category: "Big", compliance: "Não Conforme" }),
    barrier({ id: 3, category: "Big", compliance: "Não Conforme" }),
  ]);
  assertStrictEquals(rows.length, 2);
  assertStrictEquals(rows[0].name, "Big");
  assertStrictEquals(rows[0]["Não Conforme"], 2);
  assertStrictEquals(rows[1].Conforme, 1);
});

Deno.test("computeChartData buckets novel compliance as NC", () => {
  const rows = computeChartData([
    barrier({ compliance: "Parcial" }),
  ]);
  assertStrictEquals(rows[0].Conforme, 0);
  assertStrictEquals(rows[0]["Não Conforme"], 1);
});

Deno.test("computeChartData truncates names past 26 chars", () => {
  const long = "Categoria com nome extremamente longo demais";
  const rows = computeChartData([barrier({ category: long })]);
  assertEquals(rows[0].name, long.slice(0, 26) + "…");
});

Deno.test("computeChartData of empty list is empty", () => {
  assertEquals(computeChartData([]), []);
});
