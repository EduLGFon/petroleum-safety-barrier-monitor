// Server print report export - streams one PDF part of the print job.
// This is why it exists: the PDF format is a print job, and the print dialog
// lays out the whole report at once, so a big selection is printed as
// successive parts (PDF_PART_ROWS rows each) instead of one job that freezes
// the tab. The markup comes from pdfHtml.ts, the same builders the browser
// print uses, so both render identical pages.
import { printDocClose, printDocOpen, printRow } from "../export/pdfHtml.ts";
import { kpiStatsFrom } from "../export/summary.ts";
import { textStream } from "./exportStream.ts";
import type { PrintPart } from "../export/pdfHtml.ts";
import type { Barrier, KpiSnapshot } from "../types.ts";

export interface PrintMeta {
  companyName: string;
  // Totals of the whole export, so every part shows the same KPI strip.
  kpi: KpiSnapshot;
  part: PrintPart;
}

// streamPrintReport: banner + chips + the rows of one part, closed by the
// footer. The KPI strip reports the whole export (not the part), which is
// what the dashboard and the CSV RESUMO show for the same selection.
export function streamPrintReport(
  batches: AsyncIterable<Barrier[]>,
  meta: PrintMeta,
): ReadableStream<Uint8Array> {
  const { companyName, part } = meta;
  return textStream(batches, {
    head: () => [printDocOpen(companyName, kpiStatsFrom(meta.kpi), part)],
    render: (batch, offset) =>
      batch.map((b, i) => printRow(b, offset + i)).join(""),
    tail: () => [printDocClose(companyName)],
  });
}
