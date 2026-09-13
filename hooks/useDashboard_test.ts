// Hook tests for hooks/useDashboard.ts- composed dashboard state: derived rows/KPI,
// selection semantics, validated restore, page clamp, and persistence.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { memoryStorage, renderHook } from "../scripts/test-dom.ts";
import type { Barrier } from "../lib/types.ts";
import { loadDash, STORE_KEY } from "./dashboard/persistence.ts";
import { useDashboard } from "./useDashboard.ts";

function mk(
  id: number,
  instalacao: string,
  over: Partial<Barrier> = {},
): Barrier {
  return {
    id,
    tag: `BAR-${id}`,
    tipologia: "Estação Coletora",
    instalacao,
    locDesc: `${instalacao} - Local`,
    criticidade: "Não Crítica",
    categoria: "Detector de Gás",
    agrupamento: "Detecção e Monitoramento",
    dono: "Equipe de Manutenção",
    disponibilidade: "Disponível",
    conformidade: "Conforme",
    comentarios: "",
    planoAcao: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

const ALL = [
  mk(1, "FAL"),
  mk(2, "FAL", { disponibilidade: "Degradado", conformidade: "Não Conforme" }),
  mk(3, "CNC"),
];

Deno.test("useDashboard defaults: all rows, kpi total, single page", async () => {
  const hh = await renderHook(useDashboard, { args: [ALL] });
  const d = hh.get();
  assertStrictEquals(d.location, "ALL");
  assertStrictEquals(d.hydrated, true);
  assertStrictEquals(d.kpi.total, 3);
  assertStrictEquals(d.rows.length, 3);
  assertStrictEquals(d.totalPages, 1);
  assertStrictEquals(d.hasActiveFilters, false);
  assertEquals(d.selectedIds, new Set());
  assertStrictEquals(d.openBarrier, null);
});

Deno.test("useDashboard restores selection and openId from storage", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      location: "FAL",
      filters: {},
      selectedIds: [2],
      openId: 3,
    }),
  });
  const hh = await renderHook(useDashboard, { args: [ALL], storage });
  await hh.rerender(ALL);
  assertStrictEquals(hh.get().location, "FAL");
  assertEquals(hh.get().selectedIds, new Set([2]));
  assertStrictEquals(hh.get().openBarrier?.id, 3);
});

Deno.test("useDashboard drops corrupt selection/openId on restore", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({
      selectedIds: ["x", "y", 1, -2, 3],
      openId: "nope",
    }),
  });
  const hh = await renderHook(useDashboard, { args: [ALL], storage });
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set([1, 3]));
  assertStrictEquals(hh.get().openBarrier, null);
});

Deno.test("useDashboard setLocation narrows scope and clears selection", async () => {
  const hh = await renderHook(useDashboard, { args: [ALL] });
  hh.get().toggleSelect(2);
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set([2]));

  hh.get().setLocation("FAL");
  await hh.rerender(ALL);
  const d = hh.get();
  assertStrictEquals(d.location, "FAL");
  assertStrictEquals(d.filters.page, 1);
  assertEquals(d.selectedIds, new Set());
  assertStrictEquals(d.kpi.total, 2);
  assertStrictEquals(d.rows.length, 2);
});

Deno.test("useDashboard resetFilters clears query and selection", async () => {
  const hh = await renderHook(useDashboard, { args: [ALL] });
  hh.get().setFilter({ query: "pump" });
  hh.get().toggleSelect(1);
  await hh.rerender(ALL);
  hh.get().resetFilters();
  await hh.rerender(ALL);
  const d = hh.get();
  assertStrictEquals(d.filters.query, "");
  assertEquals(d.selectedIds, new Set());
});

Deno.test("useDashboard toggleSelect/clearAll/selectAll manage the set", async () => {
  const hh = await renderHook(useDashboard, { args: [ALL] });
  hh.get().toggleSelect(1);
  hh.get().toggleSelect(2);
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set([1, 2]));
  hh.get().toggleSelect(2);
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set([1]));
  hh.get().clearAll();
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set());
  hh.get().selectAll();
  await hh.rerender(ALL);
  assertEquals(hh.get().selectedIds, new Set([1, 2, 3]));
});

Deno.test("useDashboard openBarrier resolves by id and nulls for unknown", async () => {
  const hh = await renderHook(useDashboard, { args: [ALL] });
  hh.get().setOpenId(2);
  await hh.rerender(ALL);
  assertStrictEquals(hh.get().openBarrier?.id, 2);
  hh.get().setOpenId(999);
  await hh.rerender(ALL);
  assertStrictEquals(hh.get().openBarrier, null);
  hh.get().setOpenId(null);
  await hh.rerender(ALL);
  assertStrictEquals(hh.get().openBarrier, null);
});

Deno.test("useDashboard self-heals a persisted page beyond the result count", async () => {
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify({ location: "ALL", filters: { page: 9 } }),
  });
  const hh = await renderHook(useDashboard, { args: [ALL], storage });
  await hh.rerender(ALL);
  assertStrictEquals(hh.get().filters.page, 1);
  await hh.rerender(ALL);
  assertEquals(hh.get().rows.map((b) => b.id), [1, 2, 3]);
});

Deno.test("useDashboard persists location/filters/selection to storage", async () => {
  const storage = memoryStorage();
  const hh = await renderHook(useDashboard, { args: [ALL], storage });
  hh.get().setFilter({ query: "pump" });
  hh.get().toggleSelect(1);
  await hh.rerender(ALL);
  const p = loadDash();
  assertStrictEquals(p.filters?.query, "pump");
  assertEquals(p.selectedIds, [1]);
  assertStrictEquals(p.location, "ALL");
});
