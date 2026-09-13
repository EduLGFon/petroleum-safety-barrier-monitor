// Unit tests for lib/dashboard/kpi.ts - single-pass KPI aggregation.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import type { Barrier } from "../types.ts";
import { computeKpi } from "./kpi.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "T-1",
    tipologia: "Estação Coletora",
    instalacao: "FAL",
    locDesc: "Rig",
    criticidade: "Não Crítica",
    categoria: "Cat",
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

Deno.test("computeKpi of empty list is all zeros", () => {
  const k = computeKpi([]);
  assertStrictEquals(k.total, 0);
  assertStrictEquals(k.pctConforme, 0);
  assertEquals(k.byDisponibilidade, {});
});

Deno.test("computeKpi splits known values and reconciles", () => {
  const k = computeKpi([
    barrier({ disponibilidade: "Disponível", conformidade: "Conforme" }),
    barrier({
      id: 2,
      disponibilidade: "Degradado",
      conformidade: "Não Conforme",
      criticidade: "Crítica",
    }),
  ]);
  assertStrictEquals(k.total, 2);
  assertStrictEquals(k.disponivel, 1);
  assertStrictEquals(k.degradado, 1);
  assertStrictEquals(k.conforme, 1);
  assertStrictEquals(k.naoConforme, 1);
  assertStrictEquals(k.criticasNC, 1);
  assertStrictEquals(k.pctConforme, 50);
});

Deno.test("computeKpi fails novel conformidade closed into NC", () => {
  const k = computeKpi([
    barrier({ disponibilidade: "Em Comissionamento", conformidade: "Parcial" }),
  ]);
  assertStrictEquals(k.conforme + k.naoConforme, k.total);
  assertStrictEquals(k.naoConforme, 1);
  assertStrictEquals(k.byConformidade?.["Parcial"], 1);
});
