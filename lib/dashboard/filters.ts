// Dashboard filters - FilterState defaults, validation, filter/sort/paginate.
// This is why it exists: one home for the client-side query pipeline plus
// the sanitizers that keep corrupt persisted state from wedging the grid.
import type { Barrier, FilterState, SortableColumn } from "../types.ts";
import { PAGE_SIZE_OPTS } from "../constants.ts";

// Applies case-insensitive query (tag/location/category) plus exact filters; empty strings mean no filter.
export function applyFilters(b: Barrier[], f: FilterState): Barrier[] {
  let d = b;
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
  // ISO dates compare lexicographically; statusSince is YYYY-MM-DD.
  if (f.since) d = d.filter((x) => x.statusSince >= f.since);
  if (f.until) d = d.filter((x) => x.statusSince <= f.until);
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

// Returns a fresh default FilterState (page 1, 25 rows, sort by id asc); new object each call.
export function defaultFilters(): FilterState {
  return {
    query: "",
    availability: "",
    compliance: "",
    category: "",
    since: "",
    until: "",
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
  "criticality",
  "category",
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
export function sanitizeFilters(raw: unknown): FilterState {
  return { ...defaultFilters(), ...sanitizeFilterPatch(raw) };
}
