// Spreadsheet export - barriers as .xls (HTML table for Excel/LibreOffice).
// This is why it exists: zero-dependency spreadsheet with brand header, KPI
// strip, auto-fitted columns, styled rows, and a summary table. Markup lives
// in excelHtml.ts so the server can stream the same file for big selections.
import {
  fitColWidths,
  xlsDocClose,
  xlsDocOpen,
  xlsRow,
  xlsSheetClose,
  xlsSheetOpen,
  xlsSummary,
} from "./excelHtml.ts";

import { EXPORT_MAX_ROWS, refusalMessage, XLS_SHEET_ROWS } from "./limits.ts";
import { assertBrowser, download } from "./html.ts";

import type { Barrier } from "../types.ts";

import { kpiStats, summaryRows } from "./summary.ts";

import { FMT_EXT, FMT_MIME } from "./format.ts";

import { row } from "./rows.ts";

// buildExcelHtml: the whole .xls document as one string, split into
// Excel-sized worksheets (one <table> each) so a file wider than
// XLS_SHEET_ROWS still opens. Server exports stream the same builders from
// excelHtml.ts instead, so an 18k selection never has to exist as a single
// string in the browser.
export function buildExcelHtml(
  barriers: Barrier[],
  companyName = "",
): string {
  const stats = kpiStats(barriers);
  const data = barriers.map(row);
  const widths = fitColWidths(data);
  const sheets = Math.max(1, Math.ceil(barriers.length / XLS_SHEET_ROWS));
  const out: string[] = [xlsDocOpen()];
  for (let sheet = 1; sheet <= sheets; sheet++) {
    const at = (sheet - 1) * XLS_SHEET_ROWS;
    const end = Math.min(at + XLS_SHEET_ROWS, barriers.length);
    out.push(
      xlsSheetOpen({ companyName, stats, widths, sheet, sheets }),
      ...barriers
        .slice(at, end)
        .map((b, i) => xlsRow(b, at + i, data[at + i])),
      xlsSheetClose(companyName),
    );
  }
  out.push(xlsSummary(summaryRows(barriers), companyName), xlsDocClose());
  return out.join("");
}

// exportToExcel: downloads the spreadsheet for the whole selection; browser
// only. Refuses beyond EXPORT_MAX_ROWS with an actionable error (the server
// path handles larger exports by streaming and splitting worksheets).
export function exportToExcel(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): void {
  assertBrowser();
  if (barriers.length > EXPORT_MAX_ROWS) {
    throw new Error(refusalMessage("Excel", barriers.length));
  }
  // Leading BOM so Excel on Windows reads the file as pt-BR.
  download(
    new Blob(["\uFEFF" + buildExcelHtml(barriers, companyName)], {
      type: FMT_MIME.xls,
    }),
    `${filename}${FMT_EXT.xls}`,
  );
}
