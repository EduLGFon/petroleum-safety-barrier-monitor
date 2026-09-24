// Barriers table - Aurora glass ledger.
// This is why it exists: the tabular inventory itself; rows read as dark
// list items (mono tag, dim location, glass pills) while
// sorting, selection and pagination keep working underneath.
//
// Refresh contract: row updates (filter/page/search/pageSize/sort) never
// unmount the card, never flash the global splash, and never yank the
// viewport. While `isRefreshing` the stale rows stay mounted (dimmed +
// hairline sweep); the card locks its previous height so shorter results
// or a smaller pageSize ease down instead of snapping the footer up.
// Short pages (always the last page) additionally hold the learned
// full-page height, so last<->previous paging never moves the pagination
// or the viewport. Single-page results render at natural height.
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from "./ui/Icons.tsx";
import { BarrierRow } from "./table/BarrierRow.tsx";
import { Pagination } from "./table/Pagination.tsx";
import { COLS, thSt } from "./table/columns.ts";
import { AURORA } from "../lib/aurora.ts";
import { useSettings } from "../context/SettingsContext.tsx";
import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  rows: Barrier[];
  filters: FilterState;
  filteredTotal: number;
  totalPages: number;
  selectedIds: Set<number>;
  // True while a background refetch is in flight with stale rows on screen.
  // False on first paint (splash covers) and in sync client mode.
  isRefreshing?: boolean;
  onToggleSelect: (id: number) => void;
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
    isRefreshing = false,
    onToggleSelect,
    onSort,
    onPageChange,
    onPageSize,
    onSelect,
  }: Props,
) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  // Locked card height captured when a refresh starts: keeps shorter
  // results / smaller pageSize from collapsing the page mid-flight.
  // Released (eased down via CSS transition) once fresh rows land.
  const [lockedMinH, setLockedMinH] = useState<number | null>(null);
  // Full-page floor for short pages. Geometry (header + per-row height) is
  // learned from settled renders with no artificial floor applied, so it
  // tracks the active density; short pages then hold
  // headerH + rowH * pageSize while paged results exist.
  const metricsRef = useRef({ headerH: 0, rowH: 0 });
  const [floorH, setFloorH] = useState<number | null>(null);
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

  // Learn row geometry from settled renders and hold short pages at full
  // height. Learning skips refreshing renders and renders with a floor or
  // lock applied (both inflate the measurement). Any non-empty settled page
  // teaches rowH since rows share one stable height (single-line cells +
  // fixed NC slot); the header is re-measured live so density switches
  // correct the floor even before a full page re-renders.
  useEffect(() => {
    if (isRefreshing || rows.length === 0) {
      if (rows.length === 0) setFloorH(null);
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    const headerH = card.querySelector("thead")?.offsetHeight ??
      metricsRef.current.headerH;
    const inflated = lockedMinH != null || floorH != null;
    if (!inflated && rows.length > 0) {
      const rowH = (card.offsetHeight - headerH) / rows.length;
      if (rowH > 0 && Number.isFinite(rowH)) {
        metricsRef.current = { headerH, rowH };
      }
    }
    // Short pages hold full-page height only while paging exists: a lone
    // short result set renders at natural height instead of a giant card.
    if (rows.length < filters.pageSize && totalPages > 1) {
      const { rowH } = metricsRef.current;
      if (rowH > 0) {
        const floor = Math.round(headerH + rowH * filters.pageSize);
        setFloorH((prev) => (prev === floor ? prev : floor));
        return;
      }
    }
    // Full pages need no floor (bails out when already null).
    setFloorH(null);
  }, [
    rows,
    filters.pageSize,
    totalPages,
    isRefreshing,
    lockedMinH,
    floorH,
    settings.density,
  ]);

  // Effective floor: refresh lock wins mid-flight, learned floor the rest
  // of the time. PageSize growth extends downward (normal flow, no
  // auto-scroll); shrink and short pages hold still instead of snapping.
  const minH = Math.max(lockedMinH ?? 0, floorH ?? 0);
  const refreshing = showRefreshing && isRefreshing;

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
          // Locked floor while refreshing (eased release after fresh rows)
          // plus the learned full-page floor for short pages.
          minHeight: minH > 0 ? `${minH}px` : undefined,
        }}
      >
        {/* Premium refresh hairline: accent sweep across the card top. */}
        <div
          aria-hidden="true"
          className={"table-hairline" + (refreshing ? " is-on" : "")}
        />
        <div style={{ overflowX: "auto" }}>
          <table
            className="table-fixed"
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}
          >
            <thead>
              <tr>
                <th style={{ ...thSt, width: 44, cursor: "default" }} />
                {COLS.map((c) => (
                  <th
                    key={c.col}
                    scope="col"
                    aria-sort={filters.sortCol === c.col
                      ? filters.sortDir === "asc" ? "ascending" : "descending"
                      : "none"}
                    tabIndex={0}
                    onClick={() => onSort(c.col)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSort(c.col);
                      }
                    }}
                    style={{
                      ...thSt,
                      width: c.w,
                      cursor: "pointer",
                      color: filters.sortCol === c.col
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  >
                    {c.label}
                    {filters.sortCol === c.col
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
                ))}
                <th style={{ ...thSt, width: 40, cursor: "default" }} />
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
                      colSpan={COLS.length + 2}
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
