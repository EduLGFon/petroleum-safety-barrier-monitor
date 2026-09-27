// Export limits - the row ceilings each format really carries.
// This is why it exists: exports run over the full selection (18k barriers
// and up), so the ceilings come from the formats themselves (Excel sheet
// rows, browser print job) rather than an arbitrary cap, and the over-cap
// wording stays identical wherever a refusal still happens.
import { fmt } from "../format.ts";

// Hard ceiling for one export in any format and mode. Sits below Excel's
// 1,048,576-row workbook limit and keeps a CSV around 60 MB at ~300 bytes
// per row, so anything larger is split by the caller, never silently cut.
export const EXPORT_MAX_ROWS = 200_000;

// Rows fetched per database round trip while streaming. Keeps only one batch
// resident in memory and every export query small, whatever the size.
export const EXPORT_PAGE_ROWS = 5_000;

// Excel refuses more than 65,536 data rows per worksheet, so wider exports
// are split into successive <table> elements (one worksheet each).
export const XLS_SHEET_ROWS = 65_536;

// Rows per print job. The print dialog lays out the whole report at once, so
// big selections print as successive parts instead of one job that freezes
// the tab; the part number lands in the suggested PDF filename.
export const PDF_PART_ROWS = 2_000;

// refusalMessage: pt-BR error naming the ceiling and the real row count, so
// the caller knows exactly how much to drop from the filter.
export function refusalMessage(format: string, count: number): string {
  return `${format} comporta até ${fmt(EXPORT_MAX_ROWS)} registros por ` +
    `exportação; o filtro tem ${fmt(count)}. Filtre mais ou exporte CSV.`;
}
