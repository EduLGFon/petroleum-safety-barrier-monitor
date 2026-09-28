// Dashboard filters - FilterState defaults, validation, filter/sort/paginate.
// This is why it exists: one home for the client-side query pipeline plus
// the sanitizers that keep corrupt persisted state from wedging the grid.
import type { Barrier, FilterState, SortableColumn } from "../types.ts";
import { isCriticalRankLabel } from "../enums/codes.ts";
import { PAGE_SIZE_OPTS } from "../constants.ts";

// Applies the row visibility scope first (admin Situacao filter).
// Absent flags read as active/live (old payloads and fixtures).
export function applyRowScope(
  b: Barrier[],
  scope: FilterState["rowScope"],
): Barrier[] {
  if (scope === "inactive") {
    return b.filter((x) =>
      (x.deletedAt ?? null) === null && (x.isActive ?? true) === false
    );
  }
  if (scope === "deleted") {
    return b.filter((x) => (x.deletedAt ?? null) !== null);
  }
  if (scope === "all") return b;
  return b.filter((x) =>
    (x.deletedAt ?? null) === null && (x.isActive ?? true) === true
  );
}

// Applies case-insensitive query (tag/location/category) plus exact filters; empty strings mean no filter.
export function applyFilters(b: Barrier[], f: FilterState): Barrier[] {
  let d = applyRowScope(b, f.rowScope);
  if (f.query) {
    const q = f.query.toLowerCase();
    d = d.filter((x) =>
      x.tag.toLowerCase().includes(q) ||
      x.location.toLowerCase().includes(q) ||
      x.category.toLowerCase().includes(q)
    );
  }
  if (f.availability) {
    d = d.filter((x) => x.availability === f.availability);
  }
  if (f.compliance) d = d.filter((x) => x.compliance === f.compliance);
  if (f.category) d = d.filter((x) => x.category === f.category);
  if (f.typology) d = d.filter((x) => x.typology === f.typology);
  if (f.criticality) d = d.filter((x) => x.criticality === f.criticality);
  if (f.criticalOnly === true) {
    d = d.filter((x) => isCriticalRankLabel(x.criticality));
  }
  if (f.plan === "Com plano") d = d.filter((x) => x.actionPlan.trim() !== "");
  else if (f.plan === "Sem plano") {
    d = d.filter((x) => x.actionPlan.trim() === "");
  }
  // ISO dates compare lexicographically on the YYYY-MM-DD date part only;
  // statusSince rides as YYYY-MM-DD (wire to_char) but may carry a time
  // suffix in some payloads - slicing both sides keeps same-day Desde/Até
  // ranges inclusive instead of dropping the boundary day (off-by-one).
  // Empty statusSince never matches an active bound (fail-closed).
  if (f.since) {
    const since = f.since.slice(0, 10);
    d = d.filter((x) => (x.statusSince || "").slice(0, 10) >= since);
  }
  if (f.until) {
    const until = f.until.slice(0, 10);
    d = d.filter((x) => {
      const ds = (x.statusSince || "").slice(0, 10);
      return ds !== "" && ds <= until;
    });
  }
  return d;
}

// Shared collator: one instance for every compare (creating one per compare
// was the 50k-row hotspot: ~800k locale setups per keystroke).
const collator = new Intl.Collator("pt-BR", { numeric: true });

// Sorts a copy (no mutation); id numeric, other columns via the shared pt-BR
// collator over precomputed lowercase keys (one toLowerCase per row, not per
// comparison); no sortCol returns input as-is.
export function applySorting(b: Barrier[], f: FilterState): Barrier[] {
  if (!f.sortCol) return b;
  const dir = f.sortDir === "asc" ? 1 : -1;
  if (f.sortCol === "id") {
    return [...b].sort((a, x) => (a.id - x.id) * dir);
  }
  const decorated = b.map((item) => ({
    item,
    // ISO dates sort lexicographically correctly
    key: String(item[f.sortCol as keyof Barrier] ?? "").toLowerCase(),
  }));
  decorated.sort((a, x) => collator.compare(a.key, x.key) * dir);
  return decorated.map((d) => d.item);
}

// Slices 1-based page window; out-of-range pages return empty, never throws.
export function paginate<T>(a: T[], p: number, s: number): T[] {
  return a.slice((p - 1) * s, p * s);
}

// Returns a fresh default FilterState (page 1, 25 rows, sort by id asc); new
// object each call. The critical-tier gate is OFF by default: the table opens
// on every rank, and the gate stays a one-tap focus filter (persisted blobs
// written before it was dropped are migrated by restoredFilters).
export function defaultFilters(): FilterState {
  return {
    query: "",
    availability: "",
    compliance: "",
    category: "",
    typology: "",
    criticality: "",
    criticalOnly: false,
    plan: "",
    since: "",
    until: "",
    rowScope: "active",
    page: 1,
    pageSize: 25,
    sortCol: "id",
    sortDir: "asc",
  };
}

// Sort columns the UI and SQL whitelist both accept; anything else falls back to id.
const SORT_COLS: SortableColumn[] = [
  "id",
  "tag",
  "location",
  "typology",
  "criticality",
  "category",
  "owner",
  "availability",
  "compliance",
  "statusSince",
];

// Validates one persisted filter patch, keeping only well-formed keys.
// Unknown or malformed values are dropped so corrupt localStorage or settings
// defaults can never wedge the dashboard into an empty state.
export function sanitizeFilterPatch(raw: unknown): Partial<FilterState> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const patch: Partial<FilterState> = {};
  const text = (v: unknown) =>
    typeof v === "string" ? v.trim().slice(0, 200) : undefined;
  const query = text(r.query);
  if (query !== undefined) patch.query = query;
  const disp = text(r.availability);
  if (disp !== undefined) patch.availability = disp;
  const conf = text(r.compliance);
  if (conf !== undefined) patch.compliance = conf;
  const cat = text(r.category);
  if (cat !== undefined) patch.category = cat;
  const typo = text(r.typology);
  if (typo !== undefined) patch.typology = typo;
  const crit = text(r.criticality);
  if (crit !== undefined) patch.criticality = crit;
  if (typeof r.criticalOnly === "boolean") patch.criticalOnly = r.criticalOnly;
  // Conflict from the old checkbox UI (explicit rank + gate on): the rank
  // wins, otherwise B/C/D rows would self-empty with no way to see why.
  if (patch.criticality && patch.criticalOnly) patch.criticalOnly = false;
  const plan = text(r.plan);
  if (plan === "Com plano" || plan === "Sem plano" || plan === "") {
    patch.plan = plan;
  }
  // Admin Situacao scope; unknown values drop so a tampered blob can never
  // wedge the grid into an empty hidden scope.
  if (
    r.rowScope === "active" || r.rowScope === "inactive" ||
    r.rowScope === "deleted" || r.rowScope === "all"
  ) {
    patch.rowScope = r.rowScope;
  }
  // ISO date bounds on statusSince; malformed values drop like the rest.
  const date = (v: unknown) => {
    if (typeof v !== "string") return undefined;
    const d = v.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  };
  const since = date(r.since);
  if (since !== undefined) patch.since = since;
  const until = date(r.until);
  if (until !== undefined) patch.until = until;
  if (Number.isInteger(r.page) && (r.page as number) > 0) {
    patch.page = Math.min(r.page as number, 100000);
  }
  if (
    Number.isInteger(r.pageSize) &&
    (PAGE_SIZE_OPTS as readonly number[]).includes(r.pageSize as number)
  ) {
    patch.pageSize = r.pageSize as FilterState["pageSize"];
  }
  if (
    typeof r.sortCol === "string" &&
    SORT_COLS.includes(r.sortCol as SortableColumn)
  ) {
    patch.sortCol = r.sortCol as SortableColumn;
  }
  if (r.sortDir === "asc" || r.sortDir === "desc") patch.sortDir = r.sortDir;
  return patch;
}

// Merges an untrusted persisted blob over fresh defaults; always complete.
// Restores that must also drop defaults an older version shipped use
// restoredFilters below.
export function sanitizeFilters(raw: unknown): FilterState {
  return { ...defaultFilters(), ...sanitizeFilterPatch(raw) };
}

// Version of the shipped filter defaults. Bump it whenever a default changes
// so blobs written under the old defaults can be migrated instead of restored
// verbatim - a value the old defaults implied would otherwise stick forever.
export const FILTER_DEFAULTS_VERSION = 3;

// restoredFilters: the filter state to hydrate with, from a persisted slice.
// The blob is sanitized, then keys that only an older implicit default could
// have written are dropped: v1 shipped the critical-tier gate ON, so a v1
// `criticalOnly: true` never meant a choice the user made. An absent or
// unparsable version counts as v1 (conservative: migrate).
export function restoredFilters(
  raw: unknown,
  version: number,
): FilterState {
  const patch = sanitizeFilterPatch(raw);
  if (!Number.isInteger(version) || version < 2) delete patch.criticalOnly;
  return { ...defaultFilters(), ...patch };
}
