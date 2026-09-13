// Unit tests for lib/export - row mapping, KPI/summary reconciliation, escaping.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import type { Barrier } from "../types.ts";
import { csvCell } from "./csv.ts";
import { escHtml } from "./html.ts";
import { row } from "./rows.ts";
import { kpiStats, summaryRows } from "./summary.ts";

function mk(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "PSV-001",
    tipologia: "Estação Coletora",
    instalacao: "FAL",
    locDesc: "FAL - Olinda",
    criticidade: "Não Crítica",
    categoria: "Válvula de Alívio de Pressão",
    agrupamento: "Sistemas de Alívio",
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

Deno.test("row maps a bare barrier to 14 columns", () => {
  const r = row(mk());
  assertStrictEquals(r.length, 14);
  assertStrictEquals(r[0], "1");
  assertStrictEquals(r[1], "PSV-001");
  assertStrictEquals(r[2], "FAL");
  assertStrictEquals(r[9], "Disponível");
  assertStrictEquals(r[11], "Conforme");
});

Deno.test("row renders empty who-equals for Conforme rows despite statusSince", () => {
  const r = row(mk({ statusSince: "2020-01-01" }));
  assertStrictEquals(r[10], "");
});

Deno.test("row renders NC duration + desde only when statusSince exists", () => {
  const nc = mk({
    conformidade: "Não Conforme",
    disponibilidade: "Indisponível",
    statusSince: "2020-01-01",
  });
  const r = row(nc);
  assertEquals(r[10], "6 anos (desde 01/01/2020)");

  const bare = row(
    mk({
      statusSince: "",
      conformidade: "Não Conforme",
      disponibilidade: "Indisponível",
    }),
  );
  assertStrictEquals(bare[10], "");
});

Deno.test("row treats any non-Conforme as NC and falls back empty dono", () => {
  const novel = row(mk({ conformidade: "Em análise" })); // fail-closed
  assertStrictEquals(novel[11], "Em análise");
  const none = row(mk({ dono: "" }));
  assertStrictEquals(none[8], "Não informado");
});

Deno.test("kpiStats yields zeros for empty input", () => {
  const s = kpiStats([]);
  assertEquals(s, {
    total: "0",
    conformes: "0",
    naoConformes: "0",
    pct: "0%",
    criticas: "0",
  });
});

Deno.test("kpiStats formats one Conforme and one critical NC", () => {
  const s = kpiStats([
    mk(),
    mk({
      id: 2,
      conformidade: "Não Conforme",
      disponibilidade: "Indisponível",
      criticidade: "Crítica",
    }),
  ]);
  assertEquals(s.total, "2");
  assertEquals(s.conformes, "1");
  assertEquals(s.naoConformes, "1");
  assertEquals(s.pct, "50%");
  assertEquals(s.criticas, "1");
});

Deno.test("summaryRows keeps novel statuses and reconciles totals", () => {
  const s = summaryRows([
    mk(),
    mk({ id: 2, disponibilidade: "Degradado", conformidade: "Não Conforme" }),
    mk({ id: 3, disponibilidade: "Novo Estado", conformidade: "Não Conforme" }),
  ]);
  const labels = s.map(([k]) => k);
  assertEquals(labels[0], "Total");
  assertEquals(labels[1], "Disponível");
  assertEquals(labels[2], "Degradado");
  assertEquals(labels[3], "Novo Estado");
  assertStrictEquals(labels.indexOf("Novo Estado") !== -1, true);

  const dispRows = s.slice(1, -4);
  const sum = dispRows.reduce((acc, [, v]) => acc + Number(v), 0);
  assertStrictEquals(sum, 3); // every status present: 1 + 1 + 1
  assertEquals(s[0][1], "3");
});

Deno.test("csvCell quotes, doubles quotes, and stringifies anything", () => {
  assertStrictEquals(csvCell("a;b"), '"a;b"');
  assertStrictEquals(csvCell('say "hi"'), '"say ""hi"""');
  assertStrictEquals(csvCell(""), '""');
  assertStrictEquals(csvCell(undefined), '""');
  assertStrictEquals(csvCell(null), '""');
  assertStrictEquals(csvCell(42), '"42"');
  assertStrictEquals(csvCell(false), '"false"');
});

Deno.test("escHtml escapes &, <, >, and double quotes", () => {
  assertStrictEquals(
    escHtml(`<script>"&"</script>`),
    "&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;",
  );
  assertStrictEquals(escHtml("plain"), "plain");
});
