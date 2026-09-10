// Unit tests for lib/dashboard/chart.ts - per-category Conforme/NC buckets.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import type { Barrier } from "../types.ts";
import { computeChartData } from "./chart.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "T-1",
    tipologia: "Tip",
    instalacao: "FAL",
    locDesc: "Rig",
    criticidade: "Não Crítica",
    categoria: "Cat A",
    agrupamento: "Ag",
    dono: "",
    disponibilidade: "Disponível",
    conformidade: "Conforme",
    comentarios: "",
    planoAcao: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

Deno.test("computeChartData groups and sorts biggest-first", () => {
  const rows = computeChartData([
    barrier({ categoria: "Small", conformidade: "Conforme" }),
    barrier({ id: 2, categoria: "Big", conformidade: "Não Conforme" }),
    barrier({ id: 3, categoria: "Big", conformidade: "Não Conforme" }),
  ]);
  assertStrictEquals(rows.length, 2);
  assertStrictEquals(rows[0].name, "Big");
  assertStrictEquals(rows[0]["Não Conforme"], 2);
  assertStrictEquals(rows[1].Conforme, 1);
});

Deno.test("computeChartData buckets novel conformidade as NC", () => {
  const rows = computeChartData([
    barrier({ conformidade: "Parcial" }),
  ]);
  assertStrictEquals(rows[0].Conforme, 0);
  assertStrictEquals(rows[0]["Não Conforme"], 1);
});

Deno.test("computeChartData truncates names past 26 chars", () => {
  const long = "Categoria com nome extremamente longo demais";
  const rows = computeChartData([barrier({ categoria: long })]);
  assertEquals(rows[0].name, long.slice(0, 26) + "…");
});

Deno.test("computeChartData of empty list is empty", () => {
  assertEquals(computeChartData([]), []);
});
