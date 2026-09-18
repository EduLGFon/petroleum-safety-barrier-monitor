// Mock API adapter - deterministic in-memory BarriersApi for demo and tests.
// This is why it exists: filters operate on raw WireBarrier[] using numeric
// ids, exactly like a real SQL WHERE clause would, then resolves only the
// final page to domain objects.
import { computeChartData, computeKpi as computeKpiLocal } from "../utils.ts";

import type { BarriersQuery, WireBarrier } from "../wireTypes.ts";

import { resolveBarriers } from "../resolve.ts";

import type { BarriersApi } from "./types.ts";

import { fromLocationId } from "../enums.ts";

import { getWireBarriers } from "../data.ts";

const COMPLIANT_STATUS_IDS = new Set([0, 1, 2, 3]); // available, out-of-service, contingency, degraded-contingency

// Derives compliance id (0 compliant / 1 non-compliant) from availability id.
function wireComplianceId(dispId: number): number {
  return COMPLIANT_STATUS_IDS.has(dispId) ? 0 : 1; // 0=compliant 1=non-compliant
}

// Checks a wire barrier against numeric query filters (mock WHERE clause).
function matchesQuery(w: WireBarrier, q: BarriersQuery): boolean {
  if (
    q.locationId !== undefined && q.locationId !== 0 &&
    w.locationId !== q.locationId
  ) return false;
  if (
    q.availabilityId !== undefined &&
    w.availabilityId !== q.availabilityId
  ) return false;
  if (
    q.complianceId !== undefined &&
    wireComplianceId(w.availabilityId) !== q.complianceId
  ) return false;
  if (q.categoryId !== undefined && w.categoryId !== q.categoryId) {
    return false;
  }
  if (q.query) {
    const s = q.query.toLowerCase();
    const locCode = fromLocationId(w.locationId).toLowerCase();
    if (!(w.tag.toLowerCase().includes(s) || locCode.includes(s))) return false;
  }
  // ISO dates compare lexicographically; statusSince is YYYY-MM-DD.
  if (q.since && w.statusSince < q.since) return false;
  if (q.until && w.statusSince > q.until) return false;
  return true;
}

// Sorts wire barriers in-memory by SortableColumn and direction.
function sortWire(
  items: WireBarrier[],
  sortCol: string,
  sortDir: "asc" | "desc",
): WireBarrier[] {
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    switch (sortCol) {
      case "id":
        return (a.id - b.id) * dir;
      case "tag":
        return a.tag.localeCompare(b.tag, "pt-BR") * dir;
      case "criticality":
        return (a.criticalityId - b.criticalityId) * dir;
      case "category":
        return (a.categoryId - b.categoryId) * dir;
      case "availability":
        return (a.availabilityId - b.availabilityId) * dir;
      case "compliance":
        return (wireComplianceId(a.availabilityId) -
          wireComplianceId(b.availabilityId)) * dir;
      case "statusSince":
        return a.statusSince.localeCompare(b.statusSince) * dir;
      default:
        return 0;
    }
  });
  return sorted;
}

export const mockAdapter: BarriersApi = {
  // Mock getBarriers: filters, sorts, paginates, resolves page to domain.
  getBarriers(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    const total = all.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sorted = sortWire(all, query.sortCol ?? "id", query.sortDir ?? "asc");
    const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);
    return Promise.resolve({
      items: resolveBarriers(pageItems),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  },

  // Mock getAllBarriers: filters/sorts all matches for export/KPI use.
  getAllBarriers(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    const sorted = sortWire(all, query.sortCol ?? "id", query.sortDir ?? "asc");
    return Promise.resolve(resolveBarriers(sorted));
  },

  // Mock getBarrierById: finds wire row by id, resolves to domain.
  getBarrierById(id) {
    const w = getWireBarriers().find((b) => b.id === id);
    return Promise.resolve(w ? resolveBarriers([w])[0] : null);
  },

  // Mock getKpi: filters by the full query and computes local KPI snapshot.
  getKpi(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    return Promise.resolve({
      ...computeKpiLocal(resolveBarriers(all)),
      syncedAt: new Date().toISOString(),
    });
  },

  // Mock getChartData: filters by the full query and computes local rows.
  getChartData(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    return Promise.resolve(computeChartData(resolveBarriers(all)));
  },
};
