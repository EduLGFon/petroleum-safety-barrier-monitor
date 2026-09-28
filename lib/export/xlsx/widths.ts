// xlsx column widths - fits every column from a sample of the export rows.
// Why it exists: a 30-column sheet is unusable when Excel picks the widths, and
// a streaming export cannot wait for every row, so the widths come from the
// first batch. Long free-text columns get a cap (they wrap) while the rest
// grow to fit their content. Widths are spreadsheet "characters", not pixels.
import { EXPORT_HEADERS } from "../columns.ts";

// Rows sampled for the width fit. Streaming yields one batch at a time, so the
// sample is capped to keep the fit O(sample) instead of O(export).
export const WIDTH_SAMPLE_ROWS = 200;

// Narrowest and widest a column may get, in characters.
const MIN_CHARS = 8;
const MAX_CHARS = 60;
const WRAP_CHARS = 26;
// Padding for the cell margins Excel adds around the text.
const CHARS_PAD = 2;

// Columns that carry free text: capped so one long comment cannot stretch the
// whole sheet. Keyed by header (not index) so inserting a column upstream
// cannot silently move the cap onto the wrong field.
const WRAP_HEADERS = new Set([
  "Comentários",
  "Plano de Ação",
  "Local Instalação",
  "Desc. Contingência",
  "Desc. Degradação",
  "Comentários 2",
]);

// wrapHeadersFor: which columns wrap, resolved against the live header list.
function wrapColumns(headers: string[]): boolean[] {
  return headers.map((h) => WRAP_HEADERS.has(h));
}

// xlsxColWidths: one width per export column, fitted from a sample of rows
// (pass [] for header-only widths). Unknown/short columns fall back to the
// header length, so an empty export still gets a readable sheet.
export function xlsxColWidths(
  sample: string[][],
  headers: string[] = EXPORT_HEADERS,
): number[] {
  const wrap = wrapColumns(headers);
  return headers.map((h, ci) => {
    let max = h.length;
    for (const row of sample) max = Math.max(max, (row[ci] ?? "").length);
    const cap = wrap[ci] ? WRAP_CHARS : MAX_CHARS;
    const chars = Math.min(cap, max) + CHARS_PAD;
    return Math.max(MIN_CHARS, Math.min(MAX_CHARS, chars));
  });
}
