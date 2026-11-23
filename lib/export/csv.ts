// CSV export - ;-separated, quote-escaped, BOM for pt-BR Excel.
// This is why it exists: the lightweight plain-text fallback when styled
// spreadsheet or print output is overkill. Headers and pt-BR formatting only.
import { EXPORT_MAX_ROWS, refusalMessage } from "./limits.ts";

import { assertBrowser, download } from "./html.ts";

import { EXPORT_HEADERS } from "./columns.ts";

import type { Barrier } from "../types.ts";

import { row } from "./rows.ts";

// OWASP formula guard: a leading = + - @ (or tab/CR) would execute as a
// spreadsheet formula on import, so prefix it with a single quote (inside the
// quoted field Excel renders the value literally). The trigger is looked for
// behind any leading whitespace: spreadsheet apps trim the cell before
// evaluating it, so " =cmd" and "\n=cmd" are formulas too. The apostrophe
// goes on the original cell, so the text the reader sees is unchanged.
const FORMULA_LEAD = /^\s*[=+\-@\t\r]/;

// ;-quote-escapes one CSV cell (double quotes double); shared by export so tests
// can cover the escaping that otherwise only runs inside a browser download.
export function csvCell(v: unknown): string {
  const raw = String(v ?? "");
  const guarded = FORMULA_LEAD.test(raw) ? "'" + raw : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// The 30 export columns, single-sourced: the browser CSV and the server
// /api/export route both build from this, so the files always agree.
export const CSV_HEADERS = EXPORT_HEADERS;

// Builds ;-separated, quote-escaped CSV with BOM for pt-BR Excel; reuses row(); browser-only.
// Client mode holds the whole file in the browser, so the selection is
// bounded by the same ceiling the other formats use (see limits.ts): the
// refusal names the real count instead of building a file the tab cannot
// hold.
export function exportToCSV(
  barriers: Barrier[],
  filename = "barreiras",
): void {
  assertBrowser();
  if (barriers.length > EXPORT_MAX_ROWS) {
    throw new Error(refusalMessage("CSV", barriers.length));
  }
  const csv = [
    CSV_HEADERS.map(csvCell).join(";"),
    ...barriers.map((b) => row(b).map(csvCell).join(";")),
  ].join("\r\n");
  download(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `${filename}.csv`,
  );
}
