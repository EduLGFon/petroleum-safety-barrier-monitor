// Unit tests for lib/resolve.ts - wire numeric ids to domain strings.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import type { WireKpiSnapshot } from "./wireTypes.ts";
import { resolveChartData, resolveKpi } from "./resolve.ts";

function snapshot(over: Partial<WireKpiSnapshot> = {}): WireKpiSnapshot {
  return {
    total: 0,
    disponivel: 0,
    foraDeOp: 0,
    indispCont: 0,
    degrCont: 0,
    degradado: 0,
    indisponivel: 0,
    conforme: 0,
    naoConforme: 0,
    pctConforme: 0,
    criticasNC: 0,
    ...over,
  };
}

Deno.test("resolveKpi translates numeric buckets to labels", () => {
  const k = resolveKpi(snapshot({
    total: 3,
    byDisponibilidade: { "0": 1, "4": 2 },
    byConformidade: { "0": 1, "1": 2 },
    byCriticidade: { "1": 2 },
    syncedAt: "2026-09-10T00:00:00.000Z",
  }));
  assertEquals(k.byDisponibilidade, { "Disponível": 1, "Degradado": 2 });
  assertEquals(k.byConformidade, { "Conforme": 1, "Não Conforme": 2 });
  assertEquals(k.byCriticidade, { "Crítica": 2 });
  assertStrictEquals(k.syncedAt, "2026-09-10T00:00:00.000Z");
});

Deno.test("resolveKpi passes string buckets through for old servers", () => {
  const k = resolveKpi(snapshot({ byDisponibilidade: { "Disponível": 5 } }));
  assertEquals(k.byDisponibilidade, { "Disponível": 5 });
});

Deno.test("resolveKpi omits absent buckets and timestamp", () => {
  const k = resolveKpi(snapshot({ total: 1 }));
  assertStrictEquals(k.byDisponibilidade, undefined);
  assertStrictEquals(k.syncedAt, undefined);
});

Deno.test("resolveChartData derives NC as total minus conforme", () => {
  const rows = resolveChartData([
    { categoriaId: 0, conforme: 2, total: 5 },
  ]);
  assertStrictEquals(rows.length, 1);
  assertStrictEquals(rows[0].Conforme, 2);
  assertStrictEquals(rows[0]["Não Conforme"], 3);
  assert(rows[0].name.length > 0);
});
