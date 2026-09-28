// Unit tests for the PDF report document - content, pagination and footer.
// The writer test's byte-level parser reads the file back, so these assert
// what a reader actually sees: brand once, every row, a footer per page.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { kpiOf, mkBarrier, mkCount } from "../fixture.ts";
import { buildPdfDocument, pdfReportPages } from "./document.ts";
import { readPdf } from "./writer_test.ts";

import type { Bytes } from "./writer.ts";

Deno.test("buildPdfDocument renders brand, rows and footer as text", async () => {
  const rows = [
    mkBarrier(),
    mkBarrier({
      id: 2,
      tag: "PSV-002",
      availability: "Indisponível",
      compliance: "Não Conforme",
      criticality: "ESO",
    }),
  ];
  const bin = await buildPdfDocument(rows, {
    companyName: "ACME",
    title: "barreiras",
    timeZone: "America/Sao_Paulo",
  });
  const pdf = await readPdf(bin);
  assertStrictEquals(pdf.pageCount, 1);
  const all = pdf.texts.join("\n");
  assert(all.includes("Monitor de Barreiras de Segurança"), all);
  assert(all.includes("ACME"), all);
  assert(all.includes("PSV-001") && all.includes("PSV-002"), all);
  // Browser-zone stamp with its offset, never the server clock alone.
  assert(all.includes("UTC-03:00"), all);
  assert(all.includes("Página 1"), all);
  // KPI chips carry the reconciling totals.
  assert(all.includes("NÃO CONFORMES"), all);
  // No URLs anywhere in the file.
  assert(!/https?:\/\//i.test(all), all);
});

Deno.test("every page repeats the header and carries a footer", async () => {
  const bin = await buildPdfDocument(mkCount(1_200), {
    companyName: "ACME",
    title: "barreiras",
  });
  const pdf = await readPdf(bin);
  assert(pdf.pageCount > 10, `only ${pdf.pageCount} pages`);
  // Exact header words never appear as data, so one per page is expected.
  // (Checked against short headers: long ones like Criticidade wrap even
  // in the header row.)
  for (const word of ["TAG", "ID", "Dono"]) {
    const hits = pdf.texts.filter((t) => t === word).length;
    assertStrictEquals(hits, pdf.pageCount, word);
  }
  // Brand title once (first page), footer stamp on every page.
  assertStrictEquals(
    pdf.texts.filter((t) => t === "Monitor de Barreiras de Segurança").length,
    1,
  );
  assertStrictEquals(
    pdf.texts.filter((t) => t.startsWith("Monitor de Barreiras · Página "))
      .length,
    pdf.pageCount,
  );
  assertStrictEquals(
    pdf.texts.filter((t) => t.startsWith("Gerado em ")).length,
    pdf.pageCount,
  );
  assert(pdf.texts.includes("PSV-1200"));
});

Deno.test("pdfReportPages streams one page at a time", async () => {
  // Back-pressure: the first page must be readable while the source still
  // has rows left, otherwise a big export buffers everything.
  const many = mkCount(500);
  let released = 0;
  const source = {
    async *[Symbol.asyncIterator]() {
      for (let at = 0; at < many.length; at += 100) {
        released += 100;
        yield many.slice(at, at + 100);
      }
    },
  };
  const pages: Bytes[] = [];
  for await (
    const page of pdfReportPages(source, {
      companyName: "ACME",
      kpi: kpiOf(many),
      title: "barreiras",
    })
  ) {
    pages.push(page);
    if (pages.length === 1) break;
  }
  assert(pages.length === 1);
  assert(released < many.length, `held ${released} rows for one page`);
});
