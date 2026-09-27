// Unit tests for the server export streamers - every format over the whole
// selection, fed in database-sized batches exactly as /api/export does.
import { streamExportXls } from "./exportXls.ts";
import { streamExportCsv, streamToText } from "./exportCsv.ts";
import { streamPrintReport } from "./exportPdf.ts";
import { batchesOf, kpiOf, mkBarrier, mkCount } from "../export/fixture.ts";
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { pdfPartCount } from "../export/parts.ts";

import type { Barrier } from "../types.ts";

function csvOf(barriers: Barrier[], size = 500): Promise<string> {
  return streamToText(
    streamExportCsv(batchesOf(barriers, size), kpiOf(barriers)),
  );
}

function xlsOf(
  barriers: Barrier[],
  size = 500,
  sheetRows?: number,
): Promise<string> {
  return streamToText(
    streamExportXls(batchesOf(barriers, size), {
      companyName: "Petrobras",
      kpi: kpiOf(barriers),
      sheets: sheetRows
        ? Math.max(1, Math.ceil(barriers.length / sheetRows))
        : 1,
      sheetRows,
    }),
  );
}

function printOf(barriers: Barrier[], size = 500): Promise<string> {
  return streamToText(
    streamPrintReport(batchesOf(barriers, size), {
      companyName: "Petrobras",
      kpi: kpiOf(barriers),
      part: { index: 1, parts: 1, total: barriers.length },
    }),
  );
}

// The styled TAG cell only exists in data rows, so these counters see the
// rows alone - not the header (<th>), the KPI strip or the summary table.
function xlsRows(html: string): number {
  return (html.match(/Courier New/g) ?? []).length;
}

function printRows(html: string): number {
  return (html.match(/font-family:Courier/g) ?? []).length;
}

// Splits a body into its <table> elements so worksheet splits are visible.
function tablesOf(html: string): number {
  return html.split("<table").length - 1;
}

Deno.test("streamExportCsv starts with a BOM for pt-BR Excel", async () => {
  const one = [mkBarrier()];
  const reader = streamExportCsv(batchesOf(one), kpiOf(one)).getReader();
  const first = await reader.read();
  if (first.done || !first.value) throw new Error("expected a head chunk");
  assertStrictEquals(first.value[0], 0xef);
  assertStrictEquals(first.value[1], 0xbb);
  assertStrictEquals(first.value[2], 0xbf);
  await reader.cancel();
});

Deno.test("streamExportCsv emits header, one row per barrier, RESUMO", async () => {
  const rows = [mkBarrier(), mkBarrier({ id: 2, tag: "PSV-002" })];
  const text = await csvOf(rows);
  // NOTE: TextDecoder strips the leading BOM, so the decoded text starts at
  // the header - the BOM itself is covered byte-level above.
  assertStrictEquals(text.startsWith('"ID";'), true);
  const lines = text.split("\r\n");
  assertStrictEquals(lines[0]!.includes('"Plano de Ação"'), true);
  assertStrictEquals(lines[1]!.includes("PSV-001"), true);
  assertStrictEquals(lines[2]!.includes("PSV-002"), true);
  const resumoIdx = lines.indexOf("RESUMO");
  assertStrictEquals(resumoIdx, 4); // header + 2 rows + blank
  const resumo = lines.slice(resumoIdx + 1).filter((l) => l !== "");
  assertStrictEquals(
    resumo.some((l) => l.includes("Total") && l.includes("2")),
    true,
  );
});

Deno.test("streamExportCsv row count spans every batch", async () => {
  // Three batches of 400: a page-local export could never reach these rows,
  // and a single-batch build could never prove the batching.
  const text = await csvOf(mkCount(1_200), 400);
  const lines = text.split("\r\n");
  // header + 1200 rows + the blank line before RESUMO.
  assertStrictEquals(lines.indexOf("RESUMO"), 1_202);
});

Deno.test("streamExportCsv of zero barriers still carries header + zeroed RESUMO", async () => {
  const text = await csvOf([]);
  const lines = text.split("\r\n");
  assertStrictEquals(lines[0]!.startsWith('"ID";'), true);
  assertStrictEquals(lines.indexOf("RESUMO"), 2);
  assertStrictEquals(
    lines.some((l) => l.includes("Total") && l.includes("0")),
    true,
  );
});

Deno.test("streamExportCsv streams before the last batch is read", async () => {
  // Back-pressure: the head plus the first batch must be readable while the
  // source still has rows left, otherwise a big export buffers everything.
  const many = mkCount(10);
  let released = 0;
  const source = {
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < many.length; at += 5) {
        released += 5;
        yield many.slice(at, at + 5);
      }
    },
  };
  const reader = streamExportCsv(source, kpiOf(many)).getReader();
  const head = await reader.read();
  assertStrictEquals(head.done, false);
  assertStrictEquals(released, 5);
  await reader.cancel();
});

Deno.test("streamExportXls emits one worksheet with every row", async () => {
  const rows = mkCount(1_200);
  const stream = streamExportXls(batchesOf(rows, 400), {
    companyName: "Petrobras",
    kpi: kpiOf(rows),
    sheets: 1,
  });
  // Byte level: the BOM has to lead the file for Excel on Windows. The
  // decoded text cannot show it (TextDecoder strips it), so the file is tee'd.
  const [head, body] = stream.tee();
  const first = await head.getReader().read();
  assertStrictEquals(first.value?.[0], 0xef);
  const html = await streamToText(body);
  // One data worksheet plus the trailing summary table.
  assertStrictEquals(tablesOf(html), 2);
  assertStrictEquals(xlsRows(html), 1_200);
  assertStrictEquals(html.startsWith("<html"), true);
  assertStrictEquals(html.includes("PSV-1200"), true);
});

Deno.test("streamExportXls splits into worksheets past the sheet limit", async () => {
  // 10 rows in worksheets of 4: 4 + 4 + 2, each labelled with its position so
  // a split file still reads as one export.
  const html = await xlsOf(mkCount(10), 4, 4);
  assertStrictEquals(tablesOf(html), 4); // 3 data sheets + summary
  assertStrictEquals(xlsRows(html), 10);
  for (const sheet of [1, 2, 3]) {
    assertStrictEquals(html.includes(`Planilha ${sheet} de 3`), true);
  }
});

Deno.test("streamPrintReport renders every batched row", async () => {
  const html = await printOf(mkCount(1_200), 400);
  assertStrictEquals(printRows(html), 1_200);
  assertStrictEquals(html.includes("PSV-1200"), true);
  assertStrictEquals(html.includes("<tbody>"), true);
  assertStrictEquals(html.includes("</tbody></table>"), true);
  // Single part: no part label in the banner.
  assertStrictEquals(html.includes("parte 1 de"), false);
});

Deno.test("streamPrintReport labels a multi-part run", async () => {
  const rows = mkCount(10);
  const html = await streamToText(
    streamPrintReport(batchesOf(rows, 4), {
      companyName: "Petrobras",
      kpi: kpiOf(rows),
      part: { index: 3, parts: 9, total: 18_000 },
    }),
  );
  assertStrictEquals(html.includes("parte 3 de 9"), true);
  // The KPI strip reports the scope the aggregate covers (these 10 rows), not
  // the print-part descriptor, so every part shows the same totals.
  assertStrictEquals(html.includes("10 registros"), true);
});

Deno.test("print parts cover the whole selection", () => {
  assertStrictEquals(pdfPartCount(0), 1);
  assertStrictEquals(pdfPartCount(1), 1);
  assertStrictEquals(pdfPartCount(2_000), 1);
  assertStrictEquals(pdfPartCount(2_001), 2);
  assertStrictEquals(pdfPartCount(18_000), 9);
});
