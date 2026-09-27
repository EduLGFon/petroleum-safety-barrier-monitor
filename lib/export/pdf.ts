// Print report export - landscape report DOM plus print-dialog flow for PDF.
// This is why it exists: printing the whole app page would leak chrome;
// a dedicated report node with print CSS (see static/styles.css) prints
// only the data table. Markup lives in pdfHtml.ts so the server streams the
// same report for the print job of a huge selection.
import { printDocClose, printDocOpen, printRow } from "./pdfHtml.ts";

import type { PrintPart } from "./pdfHtml.ts";

import { assertBrowser } from "./html.ts";
import { PDF_PART_ROWS } from "./limits.ts";
import { kpiStats, kpiStatsFrom } from "./summary.ts";
import { pdfPartCount } from "./parts.ts";
import type { Barrier, KpiSnapshot } from "../types.ts";

const REPORT_ID = "print-report";

// buildPrintReport: the landscape report markup (KPI chips + the export
// columns); pure, no DOM side effects. part labels a multi-part print run.
export function buildPrintReport(
  barriers: Barrier[],
  companyName = "",
  part?: PrintPart,
): string {
  return printDocOpen(companyName, kpiStats(barriers), part) +
    barriers.map((b, idx) => printRow(b, idx)).join("") +
    printDocClose(companyName);
}

// buildPrintReportFrom: same report from a server-side KPI snapshot, so a
// streamed print job shows the totals of the whole export, not of one batch.
export function buildPrintReportFrom(
  barriers: Barrier[],
  kpi: KpiSnapshot,
  companyName = "",
  part?: PrintPart,
): string {
  return printDocOpen(companyName, kpiStatsFrom(kpi), part) +
    barriers.map((b, idx) => printRow(b, idx)).join("") +
    printDocClose(companyName);
}

// printReportPart: mounts the report in the hidden print node, swaps the
// title (which is the PDF filename the dialog suggests), prints, and resolves
// once the dialog is dismissed. The node is emptied on the way out so the
// next part starts from an empty DOM.
export function printReportPart(
  html: string,
  title: string,
): Promise<void> {
  assertBrowser();
  let node = document.getElementById(REPORT_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = REPORT_ID;
    document.body.appendChild(node);
  }
  node.innerHTML = html;
  const prevTitle = document.title;
  document.title = title;
  document.body.classList.add("printing-report");
  // afterprint is what advances the part sequence; the timeout only keeps a
  // browser that never fires it from wedging the export forever (the dialog
  // is modal, so it cannot expire mid-print in practice).
  return new Promise<void>((resolve) => {
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      globalThis.removeEventListener("afterprint", done);
      document.body.classList.remove("printing-report");
      document.title = prevTitle;
      if (node) node.innerHTML = "";
      resolve();
    };
    globalThis.addEventListener("afterprint", done, { once: true });
    timer = setTimeout(done, 600_000);
    globalThis.print();
  });
}

// pdfPartTitle: the suggested PDF filename, numbered when the export did not
// fit one print job.
export function pdfPartTitle(
  filename: string,
  part: number,
  parts: number,
): string {
  return parts > 1 ? `${filename}-parte-${part}-de-${parts}` : filename;
}

// printPdfParts: prints a whole export as successive print jobs, one per
// PDF_PART_ROWS rows, in the order loadPart hands them over. The print dialog
// lays out the full report DOM, so a single 18k-row job would freeze the
// tab; parts keep every job small and each saved PDF is a separate file.
export async function printPdfParts(
  total: number,
  loadPart: (part: number, parts: number) => Promise<string>,
  filename: string,
): Promise<void> {
  const parts = pdfPartCount(total);
  for (let part = 1; part <= parts; part++) {
    const html = await loadPart(part, parts);
    await printReportPart(html, pdfPartTitle(filename, part, parts));
  }
}

// exportToPDF: prints the report for the whole selection; browser-only.
// Callers in server mode print parts streamed by /api/export instead
// (printReportPart), so no mode ever has to hold every row in the page.
export function exportToPDF(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): Promise<void> {
  assertBrowser();
  return printPdfParts(
    barriers.length,
    (part, parts) =>
      Promise.resolve(
        buildPrintReport(
          barriers.slice((part - 1) * PDF_PART_ROWS, part * PDF_PART_ROWS),
          companyName,
          { index: part, parts, total: barriers.length },
        ),
      ),
    filename,
  );
}
