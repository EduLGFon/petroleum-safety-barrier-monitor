// Barriers table - Aurora glass ledger.
// This is why it exists: the tabular inventory itself; columns read as
// centered cells (TAG left for mono scannability), the table fills the card
// width when few columns are shown, while sorting, selection and pagination
// keep working underneath. Visible columns arrive via props (Colunas dialog
// order); filters live in the toolbar row above the table.
//
// Refresh contract: row updates (filter/page/search/pageSize/sort) never
// unmount the card, never flash the global splash, and never yank the
// viewport. While `isRefreshing` the stale rows stay mounted (dimmed +
// hairline sweep); the card locks its previous height so the in-flight
// refetch never collapses the page mid-flight. Every page renders at
// natural height with identical row heights, so short pages (always the
// last page) end right after their last row with the pager directly below
// and no blank gap.
import { type ColumnKey, defFor, sortKeyFor, thSt } from "./table/columns.ts";
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from "./ui/Icons.tsx";
import { useEffect, useRef, useState } from "preact/hooks";
import { BarrierRow } from "./table/BarrierRow.tsx";
import { Pagination } from "./table/Pagination.tsx";
import { TriCheck } from "./export/TriCheck.tsx";
import { fmt } from "../lib/utils.ts";
import { AURORA } from "../lib/aurora.ts";

interface Props {
  rows: Barrier[];
  filters: FilterState;
  filteredTotal: number;
  totalPages: number;
  selectedIds: Set<number>;
  // Ordered visible columns (Colunas dialog); headers, rows and the
  // empty state all follow this order.
  visibleCols: ColumnKey[];
  // True while a background refetch is in flight with stale rows on screen.
  // False on first paint (splash covers) and in sync client mode.
  isRefreshing?: boolean;
  onToggleSelect: (id: number) => void;
  // Header bulk control over the visible page: onSelectPage merges the
  // page into the set; onClearAll empties it. Scope text + extension live
  // in the toolbar subtext (SelectionScope), so this header stays narrow.
  onSelectPage: () => void;
  onClearAll: () => void;
  onSort: (c: SortableColumn) => void;
  onPageChange: (p: number) => void;
  onPageSize: (n: number) => void;
  onSelect: (b: Barrier) => void;
}

// BarriersTable: renders the current page slice (rows) with sort headers, row select, and detail open; Pagination space is always reserved.
export function BarriersTable(
  {
    rows,
    filters,
    filteredTotal,
    totalPages,
    selectedIds,
    visibleCols,
    isRefreshing = false,
    onToggleSelect,
    onSelectPage,
    onClearAll,
    onSort,
    onPageChange,
    onPageSize,
    onSelect,
  }: Props,
) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Locked card height captured when a refresh starts: keeps the in-flight
  // refetch from collapsing the page mid-flight. Released (eased down via
  // CSS transition) once fresh rows land. Every page renders at natural
  // height, so the pager sits directly below the last row.
  const [lockedMinH, setLockedMinH] = useState<number | null>(null);
  // Delayed visual refresh state: avoids flashing dim/hairline on fast
  // (<150ms) fetches; only sustained refetches dim the stale rows.
  const [showRefreshing, setShowRefreshing] = useState(false);
  const wasRefreshing = useRef(false);

  useEffect(() => {
    if (isRefreshing && !wasRefreshing.current) {
      wasRefreshing.current = true;
      // Capture before the dim paints so the lock equals stale height.
      const h = cardRef.current?.offsetHeight ?? 0;
      if (h > 0) setLockedMinH(h);
      const t = setTimeout(() => setShowRefreshing(true), 150);
      return () => clearTimeout(t);
    }
    if (!isRefreshing && wasRefreshing.current) {
      wasRefreshing.current = false;
      setShowRefreshing(false);
      // Release on the next frame so the new rows paint first; the
      // `min-height` CSS transition eases a tall->short collapse instead
      // of snapping (pageSize shrink / filter narrowing).
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => setLockedMinH(null))
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [isRefreshing]);

  const refreshing = showRefreshing && isRefreshing;
  // Body cells per row: checkbox + visible columns + arrow. The empty
  // state spans them all.
  const bodySpan = visibleCols.length + 2;

  // Header bulk state over the visible page slice: checked = every visible
  // row selected, indeterminate = some but not all visible rows selected.
  // Scope (page-only vs whole filtered set) is carried by the toolbar
  // subtext + checkbox color, never a fourth checkbox state.
  const selOnPage = rows.reduce(
    (n, b) => n + (selectedIds.has(b.id) ? 1 : 0),
    0,
  );
  const allPageSel = rows.length > 0 && selOnPage === rows.length;
  const somePageSel = selOnPage > 0 && !allPageSel;
  // Full filtered scope: the page is fully picked and the selection covers
  // the whole filtered set (emerald checkbox variant + toolbar subtext).
  const allFilteredSel = filteredTotal > 0 &&
    selectedIds.size >= filteredTotal && allPageSel;

  return (
    <div>
      <div
        ref={cardRef}
        className="glass-card table-card"
        style={{
          background: AURORA.data,
          border: `1px solid ${AURORA.dataBorder}`,
          borderRadius: AURORA.dataRadius,
          overflow: "hidden",
          marginBottom: "var(--d-stack-sm)",
          position: "relative",
          // Locked floor while refreshing only (eased release after rows land).
          minHeight: lockedMinH != null ? `${lockedMinH}px` : undefined,
        }}
      >
        {/* Premium refresh hairline: accent sweep across the card top. */}
        <div
          aria-hidden="true"
          className={"table-hairline" + (refreshing ? " is-on" : "")}
        />
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              // Fill the card when few columns are shown (no blank edges);
              // wider content overflows into the scroll wrapper instead.
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "auto",
            }}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{
                    ...thSt,
                    width: 44,
                    cursor: "default",
                    textAlign: "center",
                    verticalAlign: "middle",
                    padding: "var(--d-cell-pad)",
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
                    tabIndex={rows.length > 0 ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (rows.length === 0) return;
                      if (allPageSel) onClearAll();
                      else onSelectPage();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (rows.length === 0) return;
                        if (allPageSel) onClearAll();
                        else onSelectPage();
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
                      onChange={() => {
                        if (rows.length === 0) return;
                        if (allPageSel) onClearAll();
                        else onSelectPage();
                      }}
                    />
                  </span>
                </th>
                {visibleCols.map((key) => {
                  const col = sortKeyFor(key);
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={filters.sortCol === col
                        ? filters.sortDir === "asc" ? "ascending" : "descending"
                        : "none"}
                      tabIndex={0}
                      onClick={() => onSort(col)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSort(col);
                        }
                      }}
                      style={{
                        ...thSt,
                        cursor: "pointer",
                        // TAG header stays left to match its left-aligned
                        // column; every other header centers.
                        textAlign: key === "tag" ? "left" : "center",
                        verticalAlign: "middle",
                        color: filters.sortCol === col
                          ? "var(--accent)"
                          : "var(--text-muted)",
                      }}
                    >
                      {defFor(key).label}
                      {filters.sortCol === col
                        ? filters.sortDir === "asc"
                          ? (
                            <ChevronUpIcon
                              size={12}
                              color="var(--accent)"
                              strokeWidth={2.5}
                            />
                          )
                          : (
                            <ChevronDownIcon
                              size={12}
                              color="var(--accent)"
                              strokeWidth={2.5}
                            />
                          )
                        : (
                          <SortIcon
                            size={11}
                            color="var(--border)"
                            strokeWidth={2}
                          />
                        )}
                    </th>
                  );
                })}
                <th
                  style={{
                    ...thSt,
                    width: 40,
                    cursor: "default",
                    textAlign: "center",
                    verticalAlign: "middle",
                  }}
                />
              </tr>
            </thead>
            <tbody
              aria-busy={refreshing}
              aria-live="polite"
              className={refreshing ? "table-refreshing" : undefined}
            >
              {rows.length === 0 && !isRefreshing
                ? (
                  <tr>
                    <td
                      colSpan={bodySpan}
                      className="table-empty"
                      style={{
                        padding: "var(--d-empty-pad)",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: "var(--d-lead)",
                      }}
                    >
                      Nenhuma barreira encontrada.
                    </td>
                  </tr>
                )
                : rows.map((b, i) => (
                  <BarrierRow
                    key={b.id}
                    barrier={b}
                    index={i}
                    selected={selectedIds.has(b.id)}
                    visibleCols={visibleCols}
                    onToggleSelect={onToggleSelect}
                    onSelect={onSelect}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {
        /* Pagination space is always reserved (fixed min-height) so the last
          page disappearing or pageSize changing never shifts the footer. */
      }
      <div className="table-pager-reserve">
        {totalPages > 1
          ? (
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              total={filteredTotal}
              pageSize={filters.pageSize}
              onChange={onPageChange}
              onPageSize={onPageSize}
            />
          )
          : (
            <div
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                visibility: "hidden",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: "var(--d-body)" }}>
                {filteredTotal} resultados
              </span>
            </div>
          )}
      </div>
    </div>
  );
}
