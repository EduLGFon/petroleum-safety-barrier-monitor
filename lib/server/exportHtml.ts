// Server report export - streams the HTML report of the whole scope.
// This is why it exists: the browser can only hold a page of rows, so the
// report of a large selection is generated here from database batches and
// streamed out as a file download. The markup comes from reportHtml.ts, the
// same builders the browser download uses, so both files agree cell for cell.
import { printDocClose, printDocOpen, printRow } from "../export/reportHtml.ts";
import { reportDocClose, reportDocOpen } from "../export/reportHtml.ts";
import { kpiStatsFrom } from "../export/summary.ts";
import { textStream } from "./exportStream.ts";

import type { Barrier, KpiSnapshot } from "../types.ts";

export interface ReportMeta {
  companyName: string;
  // Totals of the whole export, so the report shows the same KPI strip the
  // dashboard and the CSV RESUMO show for the same selection.
  kpi: KpiSnapshot;
  // Suggested filename, also the document <title>.
  title: string;
  // IANA zone for the banner/footer stamps, passed straight to the builders.
  timeZone?: string;
}

// streamReportDocument: standalone document head, then the rows of the whole
// scope (one chunk per batch), then the tail. The consumer downloads the
// stream as a file; nothing is ever mounted into the page DOM.
export function streamReportDocument(
  batches: AsyncIterable<Barrier[]>,
  meta: ReportMeta,
): ReadableStream<Uint8Array> {
  const { companyName, title, timeZone } = meta;
  const stats = kpiStatsFrom(meta.kpi);
  return textStream(batches, {
    head: () => [
      reportDocOpen(title) +
      printDocOpen(companyName, stats, undefined, timeZone),
    ],
    render: (batch, offset) =>
      batch.map((b, i) => printRow(b, offset + i)).join(""),
    tail: () => [printDocClose(companyName, timeZone) + reportDocClose()],
  });
}
