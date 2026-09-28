// Report export - the landscape report as a downloadable HTML file.
// This is why it exists: the report used to open through the print dialog,
// which builds a live preview of the whole table before it opens - on a large
// selection that preview froze the tab, and the browser stamped the page URL
// onto the saved file. A direct download never touches the page DOM and the
// file carries no URL. Markup lives in reportHtml.ts so the server streams
// the same document for a huge selection.
import {
  printDocClose,
  printDocOpen,
  printRow,
  reportDocument,
} from "./reportHtml.ts";

import { EXPORT_MAX_ROWS, refusalMessage } from "./limits.ts";
import { assertBrowser, download } from "./html.ts";
import { FMT_EXT, FMT_MIME } from "./format.ts";
import { kpiStats } from "./summary.ts";

import type { Barrier } from "../types.ts";

// buildReportDocument: the whole selection as one standalone HTML document
// (banner, KPI chips, the 30 export columns); pure, no DOM side effects.
export function buildReportDocument(
  barriers: Barrier[],
  companyName = "",
  title = "barreiras",
): string {
  return reportDocument(
    title,
    printDocOpen(companyName, kpiStats(barriers)) +
      barriers.map((b, idx) => printRow(b, idx)).join("") +
      printDocClose(companyName),
  );
}

// exportReportToFile: downloads the report for the whole selection;
// browser-only. Refuses beyond EXPORT_MAX_ROWS with an actionable error (the
// server path serves larger exports from streamed database batches).
export function exportReportToFile(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): void {
  assertBrowser();
  if (barriers.length > EXPORT_MAX_ROWS) {
    throw new Error(refusalMessage("Relatório", barriers.length));
  }
  download(
    new Blob([buildReportDocument(barriers, companyName, filename)], {
      type: FMT_MIME.html,
    }),
    `${filename}${FMT_EXT.html}`,
  );
}
