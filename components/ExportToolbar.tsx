// Export toolbar - Aurora glass selection bar.
// This is why it exists: the table header owns bulk selection (tri-state
// checkbox + Gmail-style scope prompt) and the filter bar owns the export
// menu, so this bar only anchors the selection count with a clear action.
// CSV covers the full filtered selection while XLS/PDF stay page-local
// (see ExportMenu, which owns those actions).
import { useMemo } from "preact/hooks";
import type { Barrier } from "../lib/types.ts";
import { CloseIcon } from "./ui/Icons.tsx";
import { AURORA } from "../lib/aurora.ts";
import { fmt } from "../lib/utils.ts";

interface Props {
  selectedIds: Set<number>;
  allFiltered: Barrier[];
  // Current page slice, for the page-local XLS/PDF scope note. Defaults to
  // allFiltered when the caller has no separate page (server mode).
  pageRows?: Barrier[];
  onClearAll: () => void;
  // Server mode pages from the API: the scope note always applies there.
  serverMode?: boolean;
}
// ExportToolbar: selection count bar over the header-owned selection;
// renders nothing when no row is selected (except the server-mode scope
// note, which describes CSV/XLS coverage even with an empty selection).
export function ExportToolbar(
  {
    selectedIds,
    allFiltered,
    pageRows,
    onClearAll,
    serverMode,
  }: Props,
) {
  // Full filtered selection (CSV scope) vs page-local selection (XLS/PDF
  // scope). Stale ids outside the filter are ignored.
  const fullExportable = useMemo(
    () => allFiltered.filter((b) => selectedIds.has(b.id)),
    [allFiltered, selectedIds],
  );
  const pageList = pageRows ?? allFiltered;
  const pageExportable = useMemo(
    () => pageList.filter((b) => selectedIds.has(b.id)),
    [pageList, selectedIds],
  );
  const count = fullExportable.length, hasAny = count > 0;
  const pageCount = pageExportable.length;
  if (!hasAny) {
    if (!serverMode) return null;
    return (
      <div
        className="glass-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-bar-gap)",
          flexWrap: "wrap",
          padding: "var(--d-bar-pad)",
          marginBottom: "var(--d-bar-gap)",
          background: AURORA.data,
          border: `1px solid ${AURORA.dataBorder}`,
          borderRadius: AURORA.dataRadius,
        }}
      >
        <div
          role="note"
          data-page-export-note
          style={{
            fontSize: "var(--d-small)",
            color: AURORA.sub,
          }}
        >
          CSV abrange o conjunto filtrado; XLS/PDF somente a página atual
        </div>
      </div>
    );
  }
  const showScopeNote = serverMode || pageCount !== count;
  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-bar-gap)",
        flexWrap: "wrap",
        padding: "var(--d-bar-pad)",
        marginBottom: "var(--d-bar-gap)",
        background: AURORA.data,
        border: "1px solid rgba(99,102,241,.4)",
        borderRadius: AURORA.dataRadius,
        boxShadow: AURORA.auroraGlow,
        transition: "all .25s var(--ease-std)",
      }}
    >
      {/* Selection count (bulk control lives in the table header) */}
      <span
        className="tnum"
        style={{
          fontSize: "var(--d-body)",
          fontWeight: 600,
          color: AURORA.pillText,
          whiteSpace: "nowrap",
        }}
      >
        {fmt(count)} selecionados
      </span>
      <button
        type="button"
        onClick={onClearAll}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-gap-2xs)",
          fontSize: "var(--d-small)",
          padding: "var(--d-mini-pad)",
          borderRadius: 6,
          background: "transparent",
          border: `1px solid ${AURORA.dataBorder}`,
          color: AURORA.label,
          cursor: "pointer",
          transition: "all .2s",
        }}
      >
        <CloseIcon size={11} color={AURORA.label} />Limpar
      </button>
      {showScopeNote && (
        <div
          role="note"
          data-page-export-note
          style={{
            flexBasis: "100%",
            fontSize: "var(--d-small)",
            color: AURORA.sub,
          }}
        >
          CSV abrange o conjunto filtrado ({fmt(count)}); XLS/PDF somente a
          página atual ({fmt(pageCount)})
        </div>
      )}
    </div>
  );
}
