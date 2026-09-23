/**
 * ══════════════════════════════════════════════════════════════════════════
 * WIRE TYPES - the shape of data as it travels over the network
 * ══════════════════════════════════════════════════════════════════════════
 * These mirror what a real backend would return: compact records using
 * numeric ids (see lib/enums.ts) instead of display strings. The API layer
 * (lib/api.ts) converts WireBarrier -> Barrier (domain type) via
 * `resolveBarrier`, so every other part of the app only ever sees
 * fully-resolved, human-readable domain objects.
 */

export interface WireStatusHistoryEntry {
  date: string; // ISO date
  statusId: number; // -> availability status via fromAvailabilityId
  authorId: number; // -> author name via fromAuthorId
  note: string;
}

export interface WireBarrier {
  id: number;
  tag: string;
  typologyId: number;
  locationId: number; // installation
  locDescId: number;
  criticalityId: number;
  categoryId: number;
  groupingId: number;
  ownerId: number; // -1 = none
  availabilityId: number;
  // complianceId is intentionally OMITTED - it is always derived
  // server-side (and re-derived client-side) from availabilityId,
  // so it can never drift out of sync.
  comments: string;
  actionPlan: string;
  statusSince: string; // ISO date
  statusHistory: WireStatusHistoryEntry[];
  // Sheet inventory columns (GERAL). Free text, "" = unset; Fracttal does
  // not feed them (import writes ""), admins fill them in later.
  origin: string;
  externalCode: string;
  locationName: string;
  installLocal: string;
  equipTypology: string;
  fieldInstalled: string;
  fieldOperational: string;
  opStatus: string;
  hasMaintPlan: string;
  planFollowed: string;
  failureFree: string;
  maintStatus: string;
  hasContingency: string;
  contingencyDesc: string;
  evidenceCode: string;
  degradationDesc: string;
  extraComments: string;
}

export interface WireKpiSnapshot {
  total: number;
  available: number;
  outOfService: number;
  contingencyOutage: number;
  degradedContingency: number;
  degraded: number;
  unavailable: number;
  other: number;
  compliant: number;
  nonCompliant: number;
  pctCompliant: number;
  criticalNonCompliant: number;
  // Barriers with an empty action_plan (sheet "Possui Plano" signal).
  withoutActionPlan: number;
  // Dynamic buckets - keyed by numeric id as string (JSON keys are strings),
  // e.g. byAvailability {"0": 12, "6": 3}. resolveKpi translates these to
  // display-string keys. Optional so old servers still parse; when absent the
  // UI falls back to fixed fields (known statuses only). New statuses must
  // appear here or they vanish from the band over HTTP.
  byAvailability?: Record<string, number>;
  byCompliance?: Record<string, number>;
  byCriticality?: Record<string, number>;
  // Server time when the snapshot was computed (ISO). Lets the UI show
  // staleness once the dashboard moves to server-paginated mode.
  syncedAt?: string;
}

// Per-category compliant totals for the chart. nonCompliant is derived as
// total - compliant (fail-closed: novel compliance counts as NC, same as
// computeChartData), so new values never split the chart from the KPI.
export interface WireCategoryCompliance {
  categoryId: number;
  compliant: number;
  total: number;
}

/** Query params accepted by GET /api/barriers */
export interface BarriersQuery {
  locationId?: number;
  availabilityId?: number;
  complianceId?: number;
  categoryId?: number;
  criticalityId?: number;
  // Action-plan presence: true = with plan, false = without.
  hasActionPlan?: boolean;
  query?: string;
  // Inclusive ISO-date bounds (YYYY-MM-DD) applied to status_since.
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  // Admin deleted listing only (GET /api/barriers/deleted): flips the
  // soft-delete filter to deleted-only. The dashboard never sets this.
  includeDeleted?: boolean;
}

export interface BarriersResponse {
  items: WireBarrier[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
