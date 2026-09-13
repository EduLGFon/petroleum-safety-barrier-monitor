// Unit tests for the server CSV export (P4) - stream drained to text.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { streamExportCsv, streamToText } from "./exportCsv.ts";
import type { Barrier } from "../types.ts";

function barrier(over: Partial<Barrier> = {}): Barrier {
  return {
    id: 1,
    tag: "FAL-EQ-001",
    tipologia: "Elétrica",
    instalacao: "FAL",
    locDesc: "Sala",
    criticidade: "Crítica",
    categoria: "Detecção",
    agrupamento: "G1",
    dono: "Operação",
    disponibilidade: "Disponível",
    conformidade: "Conforme",
    comentarios: "",
    planoAcao: "",
    statusSince: "2026-01-05",
    statusHistory: [],
    ...over,
  };
}

Deno.test("streamExportCsv starts with a BOM for pt-BR Excel", async () => {
  const reader = streamExportCsv([barrier()]).getReader();
  const first = await reader.read();
  if (first.done || !first.value) throw new Error("expected a head chunk");
  assertStrictEquals(first.value[0], 0xef);
  assertStrictEquals(first.value[1], 0xbb);
  assertStrictEquals(first.value[2], 0xbf);
  await reader.cancel();
});

Deno.test("streamExportCsv emits header, one row per barrier, RESUMO", async () => {
  const text = await streamToText(
    streamExportCsv([barrier(), barrier({ id: 2, tag: "FAL-EQ-002" })]),
  );
  // NOTE: TextDecoder strips the leading BOM, so the decoded text starts
  // at the header - the BOM itself is covered byte-level above.
  assertStrictEquals(text.startsWith('"ID";'), true);
  const lines = text.split("\r\n");
  assertStrictEquals(lines[0]!.includes('"Plano de Ação"'), true);
  assertStrictEquals(lines[1]!.includes("FAL-EQ-001"), true);
  assertStrictEquals(lines[2]!.includes("FAL-EQ-002"), true);
  const resumoIdx = lines.indexOf("RESUMO");
  assertStrictEquals(resumoIdx, 4); // header + 2 rows + blank
  const resumo = lines.slice(resumoIdx + 1).filter((l) => l !== "");
  assertStrictEquals(
    resumo.some((l) => l.includes("Total") && l.includes("2")),
    true,
  );
});

Deno.test("streamExportCsv data-row count always equals the input length", async () => {
  const many = Array.from(
    { length: 1_200 },
    (_, i) => barrier({ id: i + 1, tag: `T-${i + 1}` }),
  );
  const text = await streamToText(streamExportCsv(many));
  const lines = text.split("\r\n");
  const resumoIdx = lines.indexOf("RESUMO");
  assertStrictEquals(resumoIdx, 1_202); // header + 1200 rows + blank
});

Deno.test("streamExportCsv of zero barriers still carries header + zeroed RESUMO", async () => {
  const text = await streamToText(streamExportCsv([]));
  const lines = text.split("\r\n");
  assertStrictEquals(lines[0]!.startsWith('"ID";'), true);
  assertStrictEquals(lines.indexOf("RESUMO"), 2);
  assertStrictEquals(
    lines.some((l) => l.includes("Total") && l.includes("0")),
    true,
  );
});
