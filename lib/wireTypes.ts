/**
 * ══════════════════════════════════════════════════════════════════════════
 * WIRE TYPES — the shape of data as it travels over the network
 * ══════════════════════════════════════════════════════════════════════════
 * These mirror what a real backend would return: compact records using
 * numeric ids (see lib/enums.ts) instead of display strings. The API layer
 * (lib/api.ts) converts WireBarrier -> Barrier (domain type) via
 * `resolveBarrier`, so every other part of the app only ever sees
 * fully-resolved, human-readable domain objects.
 */

export interface WireStatusHistoryEntry {
  date: string; // ISO date
  statusId: number; // -> Disponibilidade via fromDisponibilidadeId
  authorId: number; // -> author name via fromAuthorId
  note: string;
}

export interface WireBarrier {
  id: number;
  tag: string;
  tipologiaId: number;
  locationId: number; // instalação
  locDescId: number;
  criticidadeId: number;
  categoriaId: number;
  agrupamentoId: number;
  donoId: number; // -1 = none
  disponibilidadeId: number;
  // conformidadeId is intentionally OMITTED — it is always derived
  // server-side (and re-derived client-side) from disponibilidadeId,
  // so it can never drift out of sync.
  comentarios: string;
  planoAcao: string;
  statusSince: string; // ISO date
  statusHistory: WireStatusHistoryEntry[];
}

export interface WireKpiSnapshot {
  total: number;
  disponivel: number;
  foraDeOp: number;
  indispCont: number;
  degrCont: number;
  degradado: number;
  indisponivel: number;
  conforme: number;
  naoConforme: number;
  pctConforme: number;
  criticasNC: number;
  // Dynamic buckets - keyed by numeric id as string (JSON keys are strings),
  // e.g. byDisponibilidade {"0": 12, "6": 3}. resolveKpi translates these to
  // display-string keys. Optional so old servers still parse; when absent the
  // UI falls back to fixed fields (known statuses only). New statuses must
  // appear here or they vanish from the band over HTTP.
  byDisponibilidade?: Record<string, number>;
  byConformidade?: Record<string, number>;
  byCriticidade?: Record<string, number>;
  // Server time when the snapshot was computed (ISO). Lets the UI show
  // staleness once the dashboard moves to server-paginated mode.
  syncedAt?: string;
}

// Per-category Conforme totals for the chart. naoConforme is derived as
// total - conforme (fail-closed: novel conformidade counts as NC, same as
// computeChartData), so new values never split the chart from the KPI.
export interface WireCategoryConformidade {
  categoriaId: number;
  conforme: number;
  total: number;
}

/** Query params accepted by GET /api/barriers */
export interface BarriersQuery {
  locationId?: number;
  disponibilidadeId?: number;
  conformidadeId?: number;
  categoriaId?: number;
  query?: string;
  // Inclusive ISO-date bounds (YYYY-MM-DD) applied to status_since.
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
}

export interface BarriersResponse {
  items: WireBarrier[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
