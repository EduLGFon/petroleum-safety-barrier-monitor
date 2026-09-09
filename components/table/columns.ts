// Table columns - shared COLS model plus header cell style.
// Why: single source keeps sortable headers and empty-state colspan in sync.
import type { SortableColumn } from "../../lib/types.ts";
import { AURORA } from "../../lib/aurora.ts";
import type { CSSProperties } from "preact";

export const COLS: { col: SortableColumn; label: string; w?: string }[] = [
  { col: "id", label: "#", w: "52px" },
  { col: "tag", label: "TAG / Identificação" },
  { col: "criticidade", label: "Criticidade", w: "140px" },
  { col: "categoria", label: "Categoria" },
  { col: "disponibilidade", label: "Disponibilidade", w: "230px" },
  { col: "conformidade", label: "Conformidade", w: "148px" },
];

export const thSt: CSSProperties = {
  padding: "var(--d-cell-pad)",
  textAlign: "left",
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
