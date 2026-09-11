// Unit tests for lib/resolve.ts - wire numeric ids to domain strings.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import type { WireKpiSnapshot } from "./wireTypes.ts";
import {
  resolveBarrier,
  resolveBarriers,
  resolveChartData,
  resolveHistoryEntry,
  resolveKpi,
} from "./resolve.ts";
import type { WireBarrier } from "./wireTypes.ts";

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

function wireBarrier(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 7,
    tag: "PSV-071",
    tipologiaId: 0,
    locationId: 1,
    locDescId: 1,
    criticidadeId: 1,
    categoriaId: 0,
    agrupamentoId: 0,
    donoId: 0,
    disponibilidadeId: 4,
    comentarios: "vazar",
    planoAcao: "calibrar",
    statusSince: "2026-01-01",
    statusHistory: [],
    ...over,
  };
}

Deno.test("resolveBarrier maps known ids; conformidade is derived, never trusted from wire", () => {
  const b = resolveBarrier(wireBarrier());
  assertStrictEquals(b.id, 7);
  assertStrictEquals(b.tag, "PSV-071");
  assertStrictEquals(b.tipologia, "Estação Coletora");
  assertStrictEquals(b.instalacao, "FAL");
  assertStrictEquals(b.criticidade, "Crítica");
  assertStrictEquals(b.categoria, "Válvula de Alívio de Pressão");
  assertStrictEquals(b.agrupamento, "Sistemas de Alívio");
  assertStrictEquals(b.dono, "Equipe de Manutenção");
  assertStrictEquals(b.disponibilidade, "Degradado");
  assertStrictEquals(b.conformidade, "Não Conforme");
});

Deno.test("resolveBarrier maps unknown numeric ids to explicit sentinels", () => {
  const b = resolveBarrier(
    wireBarrier({
      tipologiaId: 99,
      locationId: 99,
      categoriaId: 99,
      criticidadeId: 99,
      donoId: 99,
      agrupamentoId: 99,
    }),
  );
  assertStrictEquals(b.tipologia, "Tipologia (99)");
  assertStrictEquals(b.instalacao, "ST-99");
  assertStrictEquals(b.categoria, "Categoria (99)");
  assertStrictEquals(b.criticidade, "Criticidade (99)");
  assertStrictEquals(b.dono, "Dono (99)");
  assertStrictEquals(b.agrupamento, "Agrupamento (99)");
});

Deno.test("resolveBarrier derives conformidade from disponibilidade (Conforme case)", () => {
  const b = resolveBarrier(wireBarrier({ disponibilidadeId: 0 }));
  assertStrictEquals(b.conformidade, "Conforme");
});

Deno.test("resolveBarrier maps negative dono and unknown disp id", () => {
  const b = resolveBarrier(wireBarrier({ donoId: -1, disponibilidadeId: 42 }));
  assertStrictEquals(b.dono, "");
  assertStrictEquals(b.disponibilidade, "Disponibilidade (42)");
  assertStrictEquals(b.conformidade, "Não Conforme");
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
