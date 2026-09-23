// Unit tests for lib/dashboard/kpi.ts - single-pass KPI aggregation.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import type { Barrier } from "../types.ts";
import { computeKpi } from "./kpi.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "T-1",
    typology: "Estação Coletora",
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

Deno.test("computeKpi of empty list is all zeros", () => {
  const k = computeKpi([]);
  assertStrictEquals(k.total, 0);
  assertStrictEquals(k.pctCompliant, 0);
  assertEquals(k.byAvailability, {});
});

Deno.test("computeKpi splits known values and reconciles", () => {
  const k = computeKpi([
    barrier({ availability: "Disponível", compliance: "Conforme" }),
    barrier({
      id: 2,
      availability: "Degradado",
      compliance: "Não Conforme",
      criticality: "Crítica",
    }),
  ]);
  assertStrictEquals(k.total, 2);
  assertStrictEquals(k.available, 1);
  assertStrictEquals(k.degraded, 1);
  assertStrictEquals(k.compliant, 1);
  assertStrictEquals(k.nonCompliant, 1);
  assertStrictEquals(k.criticalNonCompliant, 1);
  assertStrictEquals(k.pctCompliant, 50);
});

Deno.test("computeKpi fails novel compliance closed into NC", () => {
  const k = computeKpi([
    barrier({ availability: "Em Comissionamento", compliance: "Parcial" }),
  ]);
  assertStrictEquals(k.compliant + k.nonCompliant, k.total);
  assertStrictEquals(k.nonCompliant, 1);
  assertStrictEquals(k.byCompliance?.["Parcial"], 1);
});

// Novel availability lands in other so fixed fields + other === total.
Deno.test("computeKpi counts novel availability in other", () => {
  const k = computeKpi([
    barrier({ availability: "Disponível", compliance: "Conforme" }),
    barrier({
      id: 2,
      availability: "Em Comissionamento",
      compliance: "Parcial",
    }),
  ]);
  assertStrictEquals(k.total, 2);
  assertStrictEquals(k.available, 1);
  assertStrictEquals(k.other, 1);
  assertStrictEquals(
    k.available + k.outOfService + k.contingencyOutage +
      k.degradedContingency + k.degraded + k.unavailable + k.other,
    k.total,
  );
  assertStrictEquals(k.byAvailability?.["Em Comissionamento"], 1);
});

Deno.test("computeKpi counts barriers without an action plan", () => {
  const k = computeKpi([
    barrier({ availability: "Disponível", compliance: "Conforme" }),
    barrier({
      id: 2,
      availability: "Degradado",
      compliance: "Não Conforme",
      actionPlan: "Trocar junta",
    }),
    barrier({ id: 3, actionPlan: "  " }),
  ]);
  assertStrictEquals(k.total, 3);
  assertStrictEquals(k.withoutActionPlan, 2);
});
