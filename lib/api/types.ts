// API types - public contract between dashboard and data adapters.
// This is why it exists: BarriersApi lets mock and HTTP adapters swap
// without touching consumers; DomainQuery is the UI-facing filter shape
// that toWireQuery encodes to numeric wire ids.
import type { Barrier, CategoryCompliance, KpiSnapshot } from "../types.ts";
import type { BarriersQuery } from "../wireTypes.ts";

export interface ApiOpts {
  signal?: AbortSignal;
}

export interface BarriersApi {
  /** Fetch a page of barriers matching the given (already id-encoded) query */
  getBarriers(
    query: BarriersQuery,
    opts?: ApiOpts,
  ): Promise<{ items: Barrier[]; total: number; totalPages: number }>;
  /** Fetch every barrier matching the query, unpaginated (used for export & KPI/chart calc) */
  getAllBarriers(
    query: Omit<BarriersQuery, "page" | "pageSize">,
    opts?: ApiOpts,
  ): Promise<Barrier[]>;
  /** Fetch only the ids matching the query (lightweight "select all" path) */
  getBarrierIds(
    query: Omit<BarriersQuery, "page" | "pageSize">,
    opts?: ApiOpts,
  ): Promise<number[]>;
  /** Fetch a single barrier by id */
  getBarrierById(id: number, opts?: ApiOpts): Promise<Barrier | null>;
  /** Fetch a precomputed KPI snapshot over the given filters */
  getKpi(
    query: Pick<
      BarriersQuery,
      | "locationId"
      | "availabilityId"
      | "complianceId"
      | "categoryId"
      | "typologyId"
      | "criticalityId"
      | "criticalOnly"
      | "hasActionPlan"
      | "rowScope"
      | "query"
      | "since"
      | "until"
    >,
    opts?: ApiOpts,
  ): Promise<KpiSnapshot>;
  /** Fetch per-category Conforme totals over the given filters */
  getChartData(
    query: Pick<
      BarriersQuery,
      | "locationId"
      | "availabilityId"
      | "complianceId"
      | "categoryId"
      | "typologyId"
      | "criticalityId"
      | "criticalOnly"
      | "hasActionPlan"
      | "rowScope"
      | "query"
      | "since"
      | "until"
    >,
    opts?: ApiOpts,
  ): Promise<CategoryCompliance[]>;
}

export interface DomainQuery {
  location?: string; // e.g. 'FAL' | 'ALL'
  availability?: string | string[]; // display string or ''
  compliance?: string | string[];
  category?: string | string[];
  typology?: string | string[];
  criticality?: string | string[];
  plan?: string; // '' | 'Com plano' | 'Sem plano'
  // Rank gate passthrough (true = ESO/A only); undefined = every rank.
  criticalOnly?: boolean;
  // Row visibility scope passthrough (active/inactive/deleted/all).
  rowScope?: string;
  query?: string;
  // Inclusive ISO-date bounds (YYYY-MM-DD) on statusSince.
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
}
