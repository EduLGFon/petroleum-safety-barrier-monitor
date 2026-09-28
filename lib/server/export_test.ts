// Unit tests for the server export streamers - every format over the whole
// selection, fed in database-sized batches exactly as /api/export does.
import { streamExportCsv, streamToText } from "./exportCsv.ts";
import { batchesOf, kpiOf, mkBarrier, mkCount } from "../export/fixture.ts";
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";
import { streamExportXlsx } from "./exportXlsx.ts";
import { streamReportDocument } from "./exportHtml.ts";
import type { Bytes } from "../export/xlsx/zip.ts";

import type { Barrier } from "../types.ts";

function csvOf(barriers: Barrier[], size = 500): Promise<string> {
  return streamToText(
    streamExportCsv(batchesOf(barriers, size), kpiOf(barriers)),
  );
}

// xlsxOf: the streamed workbook as one array, so the test can read the
// package back (SheetJS in workbook_test.ts, the part names here).
function xlsxOf(barriers: Barrier[], size = 500): Promise<Bytes> {
  const stream = streamExportXlsx(batchesOf(barriers, size), {
    companyName: "Petrobras",
    kpi: kpiOf(barriers),
  });
  return new Response(stream).arrayBuffer().then((b) => new Uint8Array(b));
}

function reportOf(barriers: Barrier[], size = 500): Promise<string> {
  return streamToText(
    streamReportDocument(batchesOf(barriers, size), {
      companyName: "Petrobras",
      kpi: kpiOf(barriers),
      title: "barreiras",
    }),
  );
}

function printRows(html: string): number {
  return (html.match(/font-family:Courier/g) ?? []).length;
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

Deno.test("streamExportXlsx writes a workbook package over every batch", async () => {
  const rows = mkCount(1_200);
  const bin = await xlsxOf(rows, 400);
  // A ZIP container, not HTML: "PK" then the package part names.
  assertStrictEquals(bin[0], 0x50);
  assertStrictEquals(bin[1], 0x4b);
  const names = new TextDecoder().decode(bin);
  for (
    const part of [
      "[Content_Types].xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
      "xl/styles.xml",
    ]
  ) {
    assert(names.includes(part), `missing ${part}`);
  }
  // Deflated: an 18k-row selection would be an order of magnitude bigger as
  // the HTML table this export used to be.
  assert(bin.length < 1_200 * 200, `workbook not compressed: ${bin.length}`);
});

Deno.test("streamExportXlsx streams before the last batch is read", async () => {
  // Back-pressure: the ZIP header must be readable while the source still has
  // rows left, otherwise a big export buffers everything.
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
  const reader = streamExportXlsx(source, {
    companyName: "Petrobras",
    kpi: kpiOf(many),
  }).getReader();
  const head = await reader.read();
  assertStrictEquals(head.done, false);
  assertStrictEquals(released, 5);
  await reader.cancel();
});

Deno.test("streamReportDocument renders one standalone file over every batch", async () => {
  const html = await reportOf(mkCount(1_200), 400);
  assertStrictEquals(printRows(html), 1_200);
  assertStrictEquals(html.includes("PSV-1200"), true);
  assertStrictEquals(html.includes("<tbody>"), true);
  assertStrictEquals(html.includes("</tbody></table>"), true);
  // One file, not print parts: standalone shell, no part labels.
  assertStrictEquals(html.startsWith("<!DOCTYPE html>"), true);
  assertStrictEquals(html.includes("parte 1 de"), false);
  assertStrictEquals(html.includes("<title>barreiras</title>"), true);
});

Deno.test("streamReportDocument carries no page URL anywhere", async () => {
  // The print dialog used to stamp the page URL onto the saved file; the
  // download must not contain any URL-shaped string.
  const html = await reportOf(mkCount(10), 4);
  assertStrictEquals(html.includes("http://"), false);
  assertStrictEquals(html.includes("https://"), false);
  assertStrictEquals(/localhost/i.test(html), false);
});
