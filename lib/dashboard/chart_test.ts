// Unit tests for lib/dashboard/chart.ts - per-category Conforme/NC buckets.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
  computeChartData,
  computePareto,
  prepareChart,
  summarizeCompliance,
  truncateLabel,
} from "./chart.ts";

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

Deno.test("computeChartData keeps full names (truncation is presentation-only)", () => {
  const long = "Categoria com nome extremamente longo demais";
  const rows = computeChartData([barrier({ category: long })]);
  assertEquals(rows[0].name, long);
});

Deno.test("truncateLabel shortens past 26 chars", () => {
  const long = "Categoria com nome extremamente longo demais";
  assertEquals(truncateLabel(long), long.slice(0, 26) + "…");
  assertStrictEquals(truncateLabel("Curta"), "Curta");
});

Deno.test("computeChartData of empty list is empty", () => {
  assertEquals(computeChartData([]), []);
});

function row(
  name: string,
  c: number,
  nc: number,
) {
  return { name, Conforme: c, "Não Conforme": nc };
}

Deno.test("prepareChart folds the tail into Outras with conserved totals", () => {
  const data = [
    row("A", 10, 0),
    row("B", 8, 0),
    row("C", 6, 0),
    row("D", 4, 0),
  ];
  const p = prepareChart(data, { limit: 2 });
  assertStrictEquals(p.rows.length, 3);
  assertStrictEquals(p.rows[0].name, "A");
  assertStrictEquals(p.rows[1].name, "B");
  assertStrictEquals(p.rows[2].name, "Outras (2)");
  assertStrictEquals(p.rows[2].Conforme, 10);
  assertStrictEquals(p.total, 4);
  assertStrictEquals(p.hidden, 2);
  assertStrictEquals(p.hiddenTotal, 10);
});

Deno.test("prepareChart has no Outras when rows fit the limit", () => {
  const p = prepareChart([row("A", 3, 1)], { limit: 10 });
  assertStrictEquals(p.rows.length, 1);
  assertStrictEquals(p.hidden, 0);
});

Deno.test("prepareChart limit 0 means expanded (no Outras)", () => {
  const data = [row("A", 5, 0), row("B", 4, 0), row("C", 3, 0)];
  const p = prepareChart(data, { limit: 0 });
  assertStrictEquals(p.rows.length, 3);
  assertStrictEquals(p.hidden, 0);
});

Deno.test("prepareChart filters by query case-insensitively", () => {
  const data = [row("Detector de Gás", 5, 0), row("Extintor", 4, 0)];
  const p = prepareChart(data, { query: "gás", limit: 0 });
  assertStrictEquals(p.rows.length, 1);
  assertStrictEquals(p.rows[0].name, "Detector de Gás");
});

Deno.test("prepareChart ncRate sort puts highest NC% first with volume guard", () => {
  const data = [
    row("BigClean", 90, 10), // 10%
    row("MidBad", 6, 4), // 40%
    row("TinyWorst", 0, 1), // 100% but below min volume
  ];
  const p = prepareChart(data, { sort: "ncRate", limit: 0 });
  assertStrictEquals(p.rows[0].name, "MidBad");
  assertStrictEquals(p.rows[1].name, "BigClean");
  assertStrictEquals(p.rows[2].name, "TinyWorst");
});

Deno.test("prepareChart alpha sort is A–Z", () => {
  const data = [row("C", 1, 0), row("A", 1, 0), row("B", 1, 0)];
  const p = prepareChart(data, { sort: "alpha", limit: 0 });
  assertEquals(p.rows.map((r) => r.name), ["A", "B", "C"]);
});

Deno.test("summarizeCompliance totals and pct", () => {
  const s = summarizeCompliance([row("A", 8, 2), row("B", 5, 5)]);
  assertStrictEquals(s.compliant, 13);
  assertStrictEquals(s.nonCompliant, 7);
  assertStrictEquals(s.total, 20);
  assertStrictEquals(s.pctCompliant, 65);
});

Deno.test("summarizeCompliance topNC is most-NC-first, clean rows excluded", () => {
  const s = summarizeCompliance([
    row("Clean", 10, 0),
    row("Worst", 1, 9),
    row("Mid", 5, 5),
  ], 2);
  assertEquals(s.topNC.map((r) => r.name), ["Worst", "Mid"]);
});

Deno.test("summarizeCompliance of empty list is 100% with no top", () => {
  const s = summarizeCompliance([]);
  assertStrictEquals(s.total, 0);
  assertStrictEquals(s.pctCompliant, 100);
  assertEquals(s.topNC, []);
});

Deno.test("computePareto covers biggest-first with cumulative shares", () => {
  const p = computePareto([
    row("A", 50, 0),
    row("B", 30, 0),
    row("C", 20, 0),
  ], 3);
  assertEquals(p.rows.map((r) => r.name), ["A", "B", "C"]);
  assertEquals(p.cumulative, [0.5, 0.8, 1]);
  assertStrictEquals(p.total, 100);
  assertStrictEquals(p.coveredPct, 100);
  assertStrictEquals(p.cutoffIndex, 1);
});

Deno.test("computePareto respects the limit and reports coverage", () => {
  const p = computePareto([row("A", 80, 0), row("B", 20, 0)], 1);
  assertStrictEquals(p.rows.length, 1);
  assertStrictEquals(p.coveredPct, 80);
  assertStrictEquals(p.cutoffIndex, 0);
});

Deno.test("computePareto of empty list is empty with cutoff -1", () => {
  const p = computePareto([]);
  assertEquals(p.rows, []);
  assertEquals(p.cumulative, []);
  assertStrictEquals(p.total, 0);
  assertStrictEquals(p.cutoffIndex, -1);
});
