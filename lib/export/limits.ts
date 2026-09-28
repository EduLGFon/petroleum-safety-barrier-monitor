// Export limits - the row ceilings each format really carries.
// This is why it exists: exports run over the full selection (18k barriers
// and up), so the ceiling comes from the formats themselves rather than an
// arbitrary cap, and the over-cap wording stays identical wherever a refusal
// still happens.
import { fmt } from "../format.ts";

// Hard ceiling for one export in any format and mode. Sits below Excel's
// 1,048,576-row worksheet limit - so the whole export always fits one sheet -
// and keeps a CSV around 60 MB at ~300 bytes per row, so anything larger is
// refused with the real count instead of silently cut.
export const EXPORT_MAX_ROWS = 200_000;

// Rows fetched per database round trip while streaming. Keeps only one batch
// resident in memory and every export query small, whatever the size.
export const EXPORT_PAGE_ROWS = 5_000;

// refusalMessage: pt-BR error naming the ceiling and the real row count, so
// the caller knows exactly how much to drop from the filter.
export function refusalMessage(format: string, count: number): string {
  return `${format} comporta até ${fmt(EXPORT_MAX_ROWS)} registros por ` +
    `exportação; o filtro tem ${fmt(count)}. Filtre mais ou exporte CSV.`;
}
