// Export row streaming - walks the export scope in database-sized batches.
// This is why it exists: an 18k-row selection must never be a single query
// or a single array. This module turns the scope into bounded batches of
// resolved Barrier objects, so the format streamers hold one batch at a time
// and the client gets bytes while the rows are still arriving.
import { EXPORT_MAX_ROWS, EXPORT_PAGE_ROWS } from "../export/limits.ts";
import { getResolverLabels } from "./sql/vocabularies.ts";
import { getKpi, listBarrierWindow } from "./sql/barriers.ts";
import { resolveBarriers, resolveKpi } from "../resolve.ts";
import type { ResolverLabels } from "../resolve.ts";
import type { Barrier, KpiSnapshot } from "../types.ts";
import type { BarriersQuery } from "../wireTypes.ts";

export interface ExportScope {
  // Query the whole export runs over (filters, sort, optional id selection).
  query: BarriersQuery;
  // Totals for the whole scope, from the same aggregate the header reports.
  kpi: KpiSnapshot;
}

// resolveExportScope: counts and aggregates the scope once, so the report
// header, the CSV RESUMO block and the row stream can never disagree.
export async function resolveExportScope(
  query: BarriersQuery,
): Promise<ExportScope> {
  const kpi = resolveKpi(await getKpi(query));
  return { query, kpi };
}

// exportBatches: yields the scope's barriers in EXPORT_PAGE_ROWS batches,
// resolved to display labels. Honours a window (print parts fetch only their
// slice) and stops at EXPORT_MAX_ROWS, past which the file stops being a
// download.
export async function* exportBatches(
  scope: ExportScope,
  window: { offset?: number; limit?: number } = {},
): AsyncGenerator<Barrier[]> {
  const offset = Math.max(0, window.offset ?? 0);
  const limit = Math.max(0, window.limit ?? EXPORT_MAX_ROWS);
  const labels: ResolverLabels = await getResolverLabels();
  let at = offset;
  let yielded = 0;
  while (yielded < limit) {
    const size = Math.min(EXPORT_PAGE_ROWS, limit - yielded);
    const rows = await listBarrierWindow(scope.query, size, at);
    if (rows.length === 0) return;
    at += rows.length;
    yielded += rows.length;
    yield resolveBarriers(rows, labels);
    // Short page: the scope ends here, no point asking again.
    if (rows.length < size) return;
  }
}
