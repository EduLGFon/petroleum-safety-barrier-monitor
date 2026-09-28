// Server PDF export - streams the report of the whole scope.
// This is why it exists: the browser can only hold a page of rows, so the
// report of a large selection is generated here from database batches and
// streamed out. The builder is the same one the browser download uses
// (lib/export/pdf/document.ts), so both files agree cell for cell, and pages
// go out as they are laid out, so nothing bigger than one page is ever
// resident.
import type { KpiSnapshot } from "../types.ts";
import { pdfReportPages } from "../export/pdf/document.ts";
import { pdfChunks } from "../export/pdf/writer.ts";
import type { Bytes } from "../export/pdf/writer.ts";

import type { Barrier } from "../types.ts";

export interface PdfMeta {
  companyName: string;
  // Scope aggregate, so the KPI strip matches the dashboard without
  // buffering every row just to count them.
  kpi: KpiSnapshot;
  // Suggested filename, also the document title.
  title: string;
  // IANA zone for the banner/footer stamps, passed straight to the builder.
  timeZone?: string;
}

// streamExportPdf: the report as a byte stream, one page at a time.
// Cancelling the response stops the generator, which releases the database
// cursor with it.
export function streamExportPdf(
  batches: AsyncIterable<Barrier[]>,
  meta: PdfMeta,
): ReadableStream<Bytes> {
  const pages = pdfReportPages(batches, meta);
  const chunks = pdfChunks(pages, {
    title: meta.title,
    author: meta.companyName || "Monitor de Barreiras de Segurança",
  });
  return new ReadableStream<Bytes>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await chunks.return?.(undefined);
    },
  });
}
