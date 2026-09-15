// Unit tests for lib/resolve.ts - wire numeric ids to domain strings.
import {
  resolveBarrier,
  resolveBarriers,
  resolveChartData,
  resolveHistoryEntry,
  resolveKpi,
} from "./resolve.ts";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { WireKpiSnapshot } from "./wireTypes.ts";

import type { WireBarrier } from "./wireTypes.ts";

function snapshot(over: Partial<WireKpiSnapshot> = {}): WireKpiSnapshot {
  return {
    total: 0,
    available: 0,
    outOfService: 0,
    contingencyOutage: 0,
    degradedContingency: 0,
    degraded: 0,
    unavailable: 0,
    compliant: 0,
    nonCompliant: 0,
    pctCompliant: 0,
    criticalNonCompliant: 0,
    ...over,
  };
}

Deno.test("resolveKpi translates numeric buckets to labels", () => {
  const k = resolveKpi(snapshot({
    total: 3,
    byAvailability: { "0": 1, "4": 2 },
    byCompliance: { "0": 1, "1": 2 },
    byCriticality: { "1": 2 },
    syncedAt: "2026-09-10T00:00:00.000Z",
  }));
  assertEquals(k.byAvailability, { "Disponível": 1, "Degradado": 2 });
  assertEquals(k.byCompliance, { "Conforme": 1, "Não Conforme": 2 });
  assertEquals(k.byCriticality, { "Crítica": 2 });
  assertStrictEquals(k.syncedAt, "2026-09-10T00:00:00.000Z");
});

Deno.test("resolveKpi passes string buckets through for old servers", () => {
  const k = resolveKpi(snapshot({ byAvailability: { "Disponível": 5 } }));
  assertEquals(k.byAvailability, { "Disponível": 5 });
});

Deno.test("resolveKpi omits absent buckets and timestamp", () => {
  const k = resolveKpi(snapshot({ total: 1 }));
  assertStrictEquals(k.byAvailability, undefined);
  assertStrictEquals(k.syncedAt, undefined);
});

Deno.test("resolveChartData derives NC as total minus compliant", () => {
  const rows = resolveChartData([
    { categoryId: 0, compliant: 2, total: 5 },
  ]);
  assertStrictEquals(rows.length, 1);
  assertStrictEquals(rows[0].Conforme, 2);
  assertStrictEquals(rows[0]["Não Conforme"], 3);
  assert(rows[0].name.length > 0);
});

function wireBarrier(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 7,
    tag: "PSV-071",
    typologyId: 0,
    locationId: 1,
    locDescId: 1,
    criticalityId: 1,
    categoryId: 0,
    groupingId: 0,
    ownerId: 0,
    availabilityId: 4,
    comments: "vazar",
    actionPlan: "calibrar",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

Deno.test("resolveBarrier maps known ids; compliance is derived, never trusted from wire", () => {
  const b = resolveBarrier(wireBarrier());
  assertStrictEquals(b.id, 7);
  assertStrictEquals(b.tag, "PSV-071");
  assertStrictEquals(b.typology, "Estação Coletora");
  assertStrictEquals(b.location, "FAL");
  assertStrictEquals(b.criticality, "Crítica");
  assertStrictEquals(b.category, "Válvula de Alívio de Pressão");
  assertStrictEquals(b.grouping, "Sistemas de Alívio");
  assertStrictEquals(b.owner, "Equipe de Manutenção");
  assertStrictEquals(b.availability, "Degradado");
  assertStrictEquals(b.compliance, "Não Conforme");
});

Deno.test("resolveBarrier maps unknown numeric ids to explicit sentinels", () => {
  const b = resolveBarrier(
    wireBarrier({
      typologyId: 99,
      locationId: 99,
      categoryId: 99,
      criticalityId: 99,
      ownerId: 99,
      groupingId: 99,
    }),
  );
  assertStrictEquals(b.typology, "Tipologia (99)");
  assertStrictEquals(b.location, "ST-99");
  assertStrictEquals(b.category, "Categoria (99)");
  assertStrictEquals(b.criticality, "Criticidade (99)");
  assertStrictEquals(b.owner, "Dono (99)");
  assertStrictEquals(b.grouping, "Agrupamento (99)");
});

Deno.test("resolveBarrier derives compliance from availability (Conforme case)", () => {
  const b = resolveBarrier(wireBarrier({ availabilityId: 0 }));
  assertStrictEquals(b.compliance, "Conforme");
});

Deno.test("resolveBarrier maps negative owner and unknown disp id", () => {
  const b = resolveBarrier(wireBarrier({ ownerId: -1, availabilityId: 42 }));
  assertStrictEquals(b.owner, "");
  assertStrictEquals(b.availability, "Disponibilidade (42)");
  assertStrictEquals(b.compliance, "Não Conforme");
});

Deno.test("resolveHistoryEntry maps ids and passes date/note through", () => {
  const e = resolveHistoryEntry({
    date: "2026-02-01",
    statusId: 5,
    authorId: 1,
    note: "teste",
  });
  assertStrictEquals(e.date, "2026-02-01");
  assertStrictEquals(e.status, "Indisponível");
  assertStrictEquals(e.author, "Maria Santos");
  assertStrictEquals(e.note, "teste");
});

Deno.test("resolveBarriers preserves order and stays empty for empty input", () => {
  const list = resolveBarriers([
    wireBarrier({ id: 2 }),
    wireBarrier({ id: 1 }),
  ]);
  assertEquals(list.map((b) => b.id), [2, 1]);
  assertStrictEquals(resolveBarriers([]).length, 0);
});

Deno.test("resolveBarrier prefers dynamic labels over seed enums", () => {
  const b = resolveBarrier(
    wireBarrier({ locationId: 99, categoryId: 50 }),
    {
      locations: { 99: "SM" },
      categories: { 50: "Válvula XV" },
    },
  );
  assertStrictEquals(b.location, "SM");
  assertStrictEquals(b.category, "Válvula XV");
});

Deno.test("resolveBarrier falls back to seed enums for ids without dynamic labels", () => {
  const b = resolveBarrier(
    wireBarrier({ locationId: 1, categoryId: 0 }),
    { locations: { 99: "SM" } },
  );
  assertStrictEquals(b.location, "FAL");
  assertStrictEquals(b.category, "Válvula de Alívio de Pressão");
});

Deno.test("resolveChartData uses dynamic category labels when provided", () => {
  const rows = resolveChartData(
    [{ categoryId: 12, compliant: 1, total: 2 }],
    { categories: { 12: "Sistema de Detecção de Gás" } },
  );
  assertEquals(rows, [{
    name: "Sistema de Detecção de Gás",
    Conforme: 1,
    "Não Conforme": 1,
  }]);
});
