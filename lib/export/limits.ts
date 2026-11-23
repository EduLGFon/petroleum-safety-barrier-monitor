// Export limits - the row ceilings each format really carries.
// This is why it exists: exports run over the full selection (18k barriers
// and up), so the ceiling comes from the formats themselves rather than an
// arbitrary cap, and the over-cap wording stays identical wherever a refusal
// still happens.
// The server path streams the rows from the database, so this ceiling is a
// format limit. The client (mock) path has no stream: it assembles the whole
// file in the browser, so the same ceiling is also the memory bound there -
// a documented ceiling instead of a rewrite of the browser builder.
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

// selectionRefusalMessage: pt-BR error for a selection over the ceiling,
// naming the real count of selected rows. A selection is refused, never
// cut: a cut selection would export a subset while the file claimed to
// cover the whole selection, which is silent data loss.
export function selectionRefusalMessage(count: number): string {
  return `A seleção tem ${fmt(count)} registros e a exportação comporta até ` +
    `${fmt(EXPORT_MAX_ROWS)}. Reduza a seleção ou filtre o escopo.`;
}
