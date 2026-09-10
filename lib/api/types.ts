// API types - public contract between dashboard and data adapters.
// This is why it exists: BarriersApi lets mock and HTTP adapters swap
// without touching consumers; DomainQuery is the UI-facing filter shape
// that toWireQuery encodes to numeric wire ids.
import type { Barrier, CategoryConformidade, KpiSnapshot } from "../types.ts";
import type { BarriersQuery } from "../wireTypes.ts";

export interface BarriersApi {
  /** Fetch a page of barriers matching the given (already id-encoded) query */
  getBarriers(
    query: BarriersQuery,
  ): Promise<{ items: Barrier[]; total: number; totalPages: number }>;
  /** Fetch every barrier matching the query, unpaginated (used for export & KPI/chart calc) */
  getAllBarriers(
    query: Omit<BarriersQuery, "page" | "pageSize">,
  ): Promise<Barrier[]>;
  /** Fetch a single barrier by id */
  getBarrierById(id: number): Promise<Barrier | null>;
  /** Fetch a precomputed KPI snapshot for the given scope */
  getKpi(query: Pick<BarriersQuery, "locationId">): Promise<KpiSnapshot>;
  /** Fetch per-category Conforme totals for the chart for the given scope */
  getChartData(
    query: Pick<BarriersQuery, "locationId">,
  ): Promise<CategoryConformidade[]>;
}

export interface DomainQuery {
  location?: string; // e.g. 'FAL' | 'ALL'
  disponibilidade?: string; // display string or ''
  conformidade?: string;
  categoria?: string;
  query?: string;
  // Inclusive ISO-date bounds (YYYY-MM-DD) on statusSince.
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
}
