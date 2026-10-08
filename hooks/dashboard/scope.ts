// Shared filter scope - one wire query for the table, select-all and export.
// This is why it exists: the export must cover exactly the rows the table
// shows, so the filter encoding is built once here instead of being restated
// per caller (three copies drifted apart before).
import type { QueryIdOverrides } from "../../lib/api/query.ts";

import type { BarriersQuery } from "../../lib/wireTypes.ts";

import type { FilterState } from "../../lib/types.ts";

import { toWireQuery } from "../../lib/api/query.ts";

// scopeWireQuery: filters only, no paging. Paging is added by the caller that
// needs it (the table), so every non-table consumer sees the whole scope.
export function scopeWireQuery(
  location: string,
  filters: FilterState,
  idMaps?: QueryIdOverrides,
): BarriersQuery {
  return toWireQuery({
    location,
    availability: filters.availability || undefined,
    compliance: filters.compliance || undefined,
    category: filters.category || undefined,
    typology: filters.typology || undefined,
    criticality: filters.criticality || undefined,
    criticalOnly: filters.criticalOnly,
    plan: filters.plan || undefined,
    rowScope: filters.rowScope,
    query: filters.query || undefined,
    since: filters.since || undefined,
    until: filters.until || undefined,
    sortCol: filters.sortCol,
    sortDir: filters.sortDir,
  }, idMaps);
}

// filterScope: the filter subset without sort/paging/ids, which is what KPI
// and chart aggregate over.
export function filterScope(q: BarriersQuery) {
  return {
    locationId: q.locationId,
    availabilityId: q.availabilityId,
    complianceId: q.complianceId,
    categoryId: q.categoryId,
    typologyId: q.typologyId,
    criticalityId: q.criticalityId,
    criticalOnly: q.criticalOnly,
    hasActionPlan: q.hasActionPlan,
    rowScope: q.rowScope,
    query: q.query,
    since: q.since,
    until: q.until,
  };
}
