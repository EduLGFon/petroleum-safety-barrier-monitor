// TableStatusRow - status row directly above the table header.
// This is why it exists: the master select-all checkbox, the result count
// / selection summary, and the filter reset share one left-aligned row so
// the filter row stays filter-only and the table header stays narrow.
// Default (nothing selected) shows the results count; any selection swaps
// in the SelectionScope summary (page count, extend-to-filtered link, or
// full-set clear link). "Limpar filtros" keeps its existing visibility
// (only while a filter is active), relocated here from the filter row.
import { SelectionScope } from "./SelectionScope.tsx";
import { TriCheck } from "../export/TriCheck.tsx";
import { CloseIcon, FilterIcon } from "../ui/Icons.tsx";
import { AURORA } from "../../lib/aurora.ts";
import { fmt } from "../../lib/utils.ts";

interface Props {
  // Ids of the visible rows on the current page.
  pageIds: number[];
  // Ids of every selected row.
  selectedIds: Set<number>;
  // Total rows in the filtered result set.
  filteredTotal: number;
  // True while any filter is active (drives count accent + reset button).
  hasActiveFilters: boolean;
  // Merges the visible page into the set; extends to every filtered row;
  // empties the set; resets filters to defaults.
  onSelectPage: () => void;
  onSelectAll: () => void | Promise<void>;
  onClearAll: () => void;
  onResetFilters: () => void;
}

// TableStatusRow: master checkbox + count/summary + filter reset in one
// left-aligned row between the filter row and the table header.
export function TableStatusRow(
  {
    pageIds,
    selectedIds,
    filteredTotal,
    hasActiveFilters,
    onSelectPage,
    onSelectAll,
    onClearAll,
    onResetFilters,
  }: Props,
) {
  // Same page-slice tri-state as the former header checkbox: checked =
  // every visible row selected, indeterminate = some but not all.
  const selOnPage = pageIds.reduce(
    (n, id) => n + (selectedIds.has(id) ? 1 : 0),
    0,
  );
  const allPageSel = pageIds.length > 0 && selOnPage === pageIds.length;
  const somePageSel = selOnPage > 0 && !allPageSel;
  const allFilteredSel = filteredTotal > 0 &&
    selectedIds.size >= filteredTotal && allPageSel;
  const hasSel = selOnPage > 0;
  const toggle = () => {
    if (pageIds.length === 0) return;
    if (allPageSel) onClearAll();
    else onSelectPage();
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-opt-gap)",
        flexWrap: "wrap",
        marginBottom: "var(--d-stack-sm)",
        padding: "0 4px",
      }}
    >
      <span
        role="checkbox"
        aria-checked={allPageSel
          ? "true"
          : somePageSel
          ? "mixed"
          : "false"}
        aria-label={allFilteredSel
          ? `Todas as ${fmt(filteredTotal)} selecionadas`
          : allPageSel
          ? "Limpar seleção da página"
          : "Selecionar página"}
        title={allFilteredSel
          ? "Toda a seleção filtrada ativa — limpar tudo"
          : allPageSel
          ? "Limpar seleção"
          : "Selecionar todos desta página"}
        tabIndex={pageIds.length > 0 ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            toggle();
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          outline: "none",
        }}
      >
        <TriCheck
          checked={allPageSel}
          indeterminate={somePageSel}
          variant={allFilteredSel ? "full" : "page"}
          onChange={toggle}
        />
      </span>
      {hasSel
        ? (
          <SelectionScope
            pageIds={pageIds}
            selectedIds={selectedIds}
            filteredTotal={filteredTotal}
            onSelectAll={onSelectAll}
            onClearAll={onClearAll}
          />
        )
        : (
          <span
            className="tnum"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-mini-gap)",
              fontSize: "var(--d-body)",
              color: hasActiveFilters ? "var(--accent-2)" : AURORA.sub,
              fontWeight: hasActiveFilters ? 600 : 400,
              whiteSpace: "nowrap",
            }}
          >
            <FilterIcon
              size={12}
              color={hasActiveFilters ? "var(--accent-2)" : AURORA.sub}
            />
            {fmt(filteredTotal)} resultado{filteredTotal !== 1 ? "s" : ""}
          </span>
        )}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          className="lift animate-filter-on"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-mini-gap)",
            padding: "var(--d-input-y) var(--d-input-x)",
            fontSize: "var(--d-body)",
            fontWeight: 700,
            background: AURORA.dangerBg,
            border: "1px solid rgba(239,68,68,.35)",
            borderRadius: 10,
            color: AURORA.dangerFg,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <CloseIcon size={12} color={AURORA.dangerFg} />Limpar filtros
        </button>
      )}
    </div>
  );
}
