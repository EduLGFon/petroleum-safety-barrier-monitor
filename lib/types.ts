/**
 * ══════════════════════════════════════════════════════════════════════════
 * TYPES - canonical domain types shared by UI, utils, hooks, and API layer
 * ══════════════════════════════════════════════════════════════════════════
 * Open string unions (Availability, Compliance, Criticality) plus
 * Barrier, KpiSnapshot, FilterState and table types. Central contract so
 * new station values compile without code changes (dynamic-data principle).
 */

export type Theme = "light" | "dark" | "amoled";
export type AccentColor =
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "brown"
  | "mono"
  | "purple";

// Domain vocabularies - open string unions on purpose. The known literals
// give autocomplete, while `string & {}` keeps new station statuses,
// categories, owners, etc. compilable without a code change (dynamic-data
// principle in agents.md). Never narrow these back to closed unions.
// (The ban-types ignores below are intentional: openness is the design.)
export type Availability =
  | "Disponível"
  | "Fora de Operação"
  | "Indisponível Contingenciado"
  | "Degradado Contingenciado"
  | "Degradado"
  | "Indisponível"
  // deno-lint-ignore ban-types
  | (string & {});

// deno-lint-ignore ban-types
export type Compliance = "Conforme" | "Não Conforme" | (string & {});
// deno-lint-ignore ban-types
export type Criticality = "Crítica" | "Não Crítica" | (string & {});

export interface StatusHistoryEntry {
  date: string;
  status: Availability;
  author: string;
  note: string;
}

export interface Barrier {
  id: number;
  tag: string;
  typology: string;
  location: string;
  locDesc: string;
  criticality: Criticality;
  category: string;
  grouping: string;
  owner: string;
  availability: Availability;
  compliance: Compliance;
  comments: string;
  actionPlan: string;
  statusSince: string;
  statusHistory: StatusHistoryEntry[];
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

export interface Location {
  code: string;
  name: string;
  type: string;
}

export interface KpiSnapshot {
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
  // Barriers without an action plan (sheet "Possui Plano" signal). The plan
  // text itself stays on Barrier.actionPlan; this count feeds the KPI card.
  withoutActionPlan: number;
  // Dynamic buckets - the fixed fields above are the well-known fast path,
  // these maps carry EVERY value present in the data (including future ones)
  // so totals always reconcile and new statuses never go missing. Keyed by
  // display string (computeKpi and resolveKpi both produce string keys).
  // Optional for backward compat with old wire snapshots; StatusBand falls
  // back to fixed fields when absent (known statuses only).
  byAvailability?: Record<string, number>;
  byCompliance?: Record<string, number>;
  byCriticality?: Record<string, number>;
  // Server time when the snapshot was computed (ISO). Absent in mock mode.
  syncedAt?: string;
}

export interface CategoryCompliance {
  name: string;
  Conforme: number;
  "Não Conforme": number;
}

// Server-provided filter vocabularies (display strings + per-station counts)
// for server-paginated mode, where the client never holds the full dataset.
// Locations and categories carry their numeric ids so dynamic resolution can
// map wire ids to these very labels instead of seed enums (see resolve.ts).
export interface Vocabularies {
  locations: { id: number; code: string; name: string; count: number }[];
  availabilities: string[];
  compliances: string[];
  criticalities: string[];
  categories: { id: number; label: string }[];
  // Status-history authors so wire authorIds beyond the seed enum resolve
  // to real names client-side (see resolve.ts). Optional so cached/older
  // payloads still parse; absent means seed-enum fallback.
  authors?: { id: number; name: string }[];
}

// Sync pipeline status for the dashboard indicator (served by
// GET /api/sync-status from sync_state; lastRun is null on a fresh
// database, and "unknown" covers that case).
export interface SyncStatus {
  state: "syncing" | "idle" | "stale" | "unknown";
  runningSince: string | null;
  lastRun: {
    scope: string;
    status: "ok" | "failed";
    startedAt: string;
    finishedAt: string;
    inserts: number;
    updates: number;
    deletes: number;
    skips: number;
    note: string;
  } | null;
  totals: { barriers: number };
}

// One barrier touched by a sync run, for the "what changed" card section
// (served by GET /api/sync-changes from barrier_status_history by the sync
// author plus recent soft deletes; kind "new" marks first-time imports).
export interface SyncChange {
  barrierId: number;
  tag: string;
  location: string;
  kind: "new" | "updated" | "removed";
  status: string;
  changedAt: string;
}

export type SortableColumn = keyof Pick<
  Barrier,
  | "id"
  | "tag"
  | "typology"
  | "criticality"
  | "category"
  | "owner"
  | "availability"
  | "compliance"
  | "statusSince"
>;

export interface FilterState {
  query: string;
  availability: string;
  compliance: string;
  category: string;
  // Sheet GERAL Criticidade (all critical in the managed scope).
  criticality: string;
  // Action-plan presence: "" (all), "Com plano", "Sem plano".
  plan: string;
  since: string;
  until: string;
  page: number;
  pageSize: number;
  sortCol: SortableColumn;
  sortDir: "asc" | "desc";
}

// Authenticated session identity crossed from server routes into islands
// (Header menu). Client-safe subset: no hashes, no expiry internals.
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
}
