// SelectionScope - inline selection-scope subtext for the toolbar.
// This is why it exists: the table header checkbox stays narrow (box only)
// while the page-vs-filtered scope lives here as small muted subtext under
// the toolbar row. Scope is carried by text + checkbox color, never a
// fourth checkbox state: page-only offers extension to the full filtered
// set, full-filtered offers an inline clear link.
import { useState } from "preact/hooks";
import { fmt } from "../../lib/utils.ts";

interface Props {
  // Ids of the visible rows on the current page.
  pageIds: number[];
  // Ids of every selected row.
  selectedIds: Set<number>;
  // Total rows in the filtered result set.
  filteredTotal: number;
  // Extends selection to every filtered row; clears the entire selection.
  onSelectAll: () => void | Promise<void>;
  onClearAll: () => void;
}

const textSt = {
  fontSize: "var(--d-small)",
  fontWeight: 400,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
} as const;

const linkSt = {
  background: "transparent",
  border: "none",
  padding: 0,
  fontSize: "var(--d-small)",
  fontWeight: 600,
  color: "var(--accent)",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  whiteSpace: "nowrap",
} as const;

// SelectionScope: toolbar subtext for the header-owned bulk selection;
// renders nothing unless at least one visible row is selected. Partial
// page picks show a plain count; a fully picked page offers extension to
// the full filtered set, which in turn offers an inline clear link.
export function SelectionScope(
  {
    pageIds,
    selectedIds,
    filteredTotal,
    onSelectAll,
    onClearAll,
  }: Props,
) {
  const [extending, setExtending] = useState(false);
  const selOnPage = pageIds.reduce(
    (n, id) => n + (selectedIds.has(id) ? 1 : 0),
    0,
  );
  const allPageSel = pageIds.length > 0 && selOnPage === pageIds.length;
  const allFilteredSel = filteredTotal > 0 &&
    selectedIds.size >= filteredTotal && allPageSel;
  const showExtend = allPageSel && !allFilteredSel &&
    filteredTotal > pageIds.length;
  if (selOnPage === 0) return null;
  async function handleExtend() {
    if (extending) return;
    setExtending(true);
    try {
      await onSelectAll();
    } finally {
      setExtending(false);
    }
  }
  return (
    <span style={textSt} role="status">
      {allFilteredSel
        ? (
          <>
            <span className="tnum">{fmt(filteredTotal)} selecionadas</span>
            {" · "}
            <button
              type="button"
              onClick={onClearAll}
              style={linkSt}
            >
              Limpar
            </button>
          </>
        )
        : showExtend
        ? (
          <>
            <span className="tnum">{fmt(pageIds.length)} selecionadas</span>
            {" · "}
            <button
              type="button"
              onClick={handleExtend}
              disabled={extending}
              style={{
                ...linkSt,
                cursor: extending ? "wait" : "pointer",
                opacity: extending ? 0.6 : 1,
              }}
            >
              {extending
                ? "Selecionando…"
                : `Selecionar todas as ${fmt(filteredTotal)}`}
            </button>
          </>
        )
        : (
          <span className="tnum">
            {fmt(selOnPage)} selecionada{selOnPage !== 1 ? "s" : ""}
          </span>
        )}
    </span>
  );
}
