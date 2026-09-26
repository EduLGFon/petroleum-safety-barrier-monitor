// Table columns - shared column registry plus header cell style.
// Why: single source for column order, labels, per-column filter kinds and
// visibility validation, keeping headers, the header filter row, rows and
// the empty-state colspan in sync.
import type { SortableColumn } from "../../lib/types.ts";

import { AURORA } from "../../lib/aurora.ts";

import type { CSSProperties } from "preact";

// ColumnKey covers every table-capable Barrier field. All keys are sortable
// (see SORTABLE in lib/server/sql/where.ts); filter availability varies.
export type ColumnKey =
  | "id"
  | "tag"
  | "typology"
  | "location"
  | "criticality"
  | "category"
  | "owner"
  | "availability"
  | "compliance"
  | "statusSince";

// FilterKind selects the control rendered in the header filter row under a
// column. "none" means sort-only (ID has no filter; owner has no owner
// dimension; statusSince is covered by the pinned date cells). "plan"/"dates"
// only occur on pinned end-cells, never on a data column.
export type FilterKind =
  | "none"
  | "search"
  | "station"
  | "typology"
  | "category"
  | "criticality"
  | "availability"
  | "compliance"
  | "plan"
  | "dates";

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  filter: FilterKind;
}

// Canonical column order. Toggling an optional column back on inserts it at
// its slot here; drag-free reorder in the Columns menu overrides the order.
export const COLUMN_DEFS: ColumnDef[] = [
  { key: "id", label: "#", filter: "none" },
  { key: "tag", label: "TAG", filter: "search" },
  { key: "typology", label: "Tipologia", filter: "typology" },
  { key: "location", label: "Estação", filter: "station" },
  { key: "criticality", label: "Criticidade", filter: "criticality" },
  { key: "category", label: "Categoria", filter: "category" },
  { key: "owner", label: "Dono", filter: "none" },
  { key: "availability", label: "Disponibilidade", filter: "availability" },
  { key: "compliance", label: "Conformidade", filter: "compliance" },
  { key: "statusSince", label: "Desde", filter: "none" },
];

// Default visible set: ID | TAG | typology | location | category |
// availability | compliance. criticality, owner and statusSince toggle back
// on from the Columns menu.
export const DEFAULT_VISIBLE_COLS: ColumnKey[] = [
  "id",
  "tag",
  "typology",
  "location",
  "category",
  "availability",
  "compliance",
];

// MENU_ORDER: registry keys in canonical slots for the Columns menu list.
export const MENU_ORDER: ColumnKey[] = COLUMN_DEFS.map((d) => d.key);

const DEF_BY_KEY: Record<ColumnKey, ColumnDef> = Object.fromEntries(
  COLUMN_DEFS.map((d) => [d.key, d]),
) as Record<ColumnKey, ColumnDef>;

// defFor: registry entry for a visible key; falls back to TAG on corrupt
// input so a bad persisted key can never crash the header render.
export function defFor(key: ColumnKey): ColumnDef {
  return DEF_BY_KEY[key] ?? DEF_BY_KEY["tag"] as ColumnDef;
}

// sortKeyFor: registry keys double as sort columns (every key is a
// SortableColumn); single cast point for header aria-sort/onSort wiring.
export function sortKeyFor(key: ColumnKey): SortableColumn {
  return key as SortableColumn;
}

function isColumnKey(v: unknown): v is ColumnKey {
  return typeof v === "string" && v in DEF_BY_KEY;
}

// sanitizeVisibleCols: keeps known keys in stored order, drops unknowns and
// dupes; undefined for non-arrays so callers fall back to defaults.
export function sanitizeVisibleCols(raw: unknown): ColumnKey[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ColumnKey[] = [];
  for (const v of raw) {
    if (isColumnKey(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

// resolveVisibleCols: stored order wins exactly (a missing key means the
// user hid it, never re-add); empty or absent resolves to the defaults.
export function resolveVisibleCols(stored: unknown): ColumnKey[] {
  const kept = sanitizeVisibleCols(stored) ?? [];
  return kept.length > 0 ? kept : [...DEFAULT_VISIBLE_COLS];
}

// PinnedKey: filter-only end-columns with no data column (plan presence and
// the date bounds). They stay pinned after the last data column whatever
// the visible order is, and toggle independently from the Columns dialog
// filters section.
export type PinnedKey = "plan" | "dates";

export const PINNED_FILTERS: { key: PinnedKey; label: string }[] = [
  { key: "plan", label: "Plano" },
  { key: "dates", label: "Período" },
];

// isPinnedKey: narrows unknown persisted values to the two pinned keys.
export function isPinnedKey(v: unknown): v is PinnedKey {
  return v === "plan" || v === "dates";
}

export const thSt: CSSProperties = {
  padding: "var(--d-cell-pad)",
  textAlign: "center",
  verticalAlign: "middle",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  cursor: "pointer",
  userSelect: "none",
  background: "transparent",
  borderBottom: `1px solid ${AURORA.rowDivider}`,
  whiteSpace: "nowrap",
  color: AURORA.sub,
};
