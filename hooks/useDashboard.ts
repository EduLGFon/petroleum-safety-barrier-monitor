/**
 * ══════════════════════════════════════════════════════════════════════════
 * USE-DASHBOARD - central dashboard state + derived data for the main page
 * ══════════════════════════════════════════════════════════════════════════
 * Composer over dashboard slices (filter-state, selection, persistence,
 * derived): filter semantics, selection/open-row state with localStorage
 * persistence (SSR-safe hydration), and paged rows/KPI/chart derivations.
 * Sole data source for dashboard islands in client (mock) mode.
 */
import { useVisibleColumns } from "./dashboard/visible-columns.ts";
import { loadDash, saveDash } from "./dashboard/persistence.ts";
import { useDashboardDerived } from "./dashboard/derived.ts";
import { useFilterState } from "./dashboard/filter-state.ts";
import { restoreSelection } from "./dashboard/selection.ts";
import { useSelection } from "./dashboard/selection.ts";
import { useCallback, useEffect } from "preact/hooks";
import type { Barrier } from "../lib/types.ts";

// Central dashboard store; starts from defaults for SSR, hydrates from `barrier-dashboard` after mount.
// Persists location/filters/selection/openId via saveDash once hydrated.
export function useDashboard(allBarriers: Barrier[], defaultLocation = "ALL") {
  const {
    location,
    filters,
    hydrated,
    hasActiveFilters,
    setLocation: setLoc,
    setFilter,
    setSort,
    resetFilters: resetFil,
    showUrgent,
  } = useFilterState(defaultLocation);
  const {
    selectedIds,
    setSelectedIds,
    openId,
    setOpenId,
    toggleSelect,
    clearAll,
  } = useSelection();
  const {
    visibleCols,
    hiddenPinned,
    toggleCol,
    moveCol,
    resetCols,
    togglePinned,
  } = useVisibleColumns();

  // After mount: restore validated selection/openId (filters restore inside
  // useFilterState; corrupt values fall back instead of wedging state).
  useEffect(() => {
    restoreSelection(loadDash(), setSelectedIds, setOpenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    saveDash({
      location,
      filters,
      selectedIds: [...selectedIds],
      openId,
      visibleCols,
      hiddenPinned,
    });
  }, [
    location,
    filters,
    hydrated,
    selectedIds,
    openId,
    visibleCols,
    hiddenPinned,
  ]);

  const {
    kpi,
    chartData,
    sorted,
    rows,
    totalPages,
    openBarrier,
    locationDetails,
  } = useDashboardDerived(allBarriers, location, filters, openId);

  // Sets location and clears selection; persisted via saveDash effect.
  const setLocation = useCallback((code: string) => {
    setLoc(code);
    clearAll();
  }, [setLoc, clearAll]);
  // Resets filters to defaults and clears selection; persisted via saveDash effect.
  const resetFilters = useCallback(() => {
    resetFil();
    clearAll();
  }, [resetFil, clearAll]);

  // Self-heals a stale persisted page (e.g. page 5 restored against a
  // now-1-page result): clamps and persists the fix instead of trapping the
  // user on an empty table with a hidden pager. Guarded, so no loop.
  useEffect(() => {
    if (!hydrated) return;
    if (filters.page > totalPages) setFilter({ page: totalPages });
  }, [hydrated, filters.page, totalPages, setFilter]);

  // Selects all currently filtered rows; persisted as selectedIds via saveDash effect.
  const selectAll = useCallback(
    () => setSelectedIds(new Set(sorted.map((b) => b.id))),
    [sorted, setSelectedIds],
  );

  // Selects only the current page slice (merges into the existing set so
  // the header checkbox can offer a Gmail-style "select all filtered"
  // extension without losing prior picks).
  const selectPage = useCallback(
    () => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const b of rows) next.add(b.id);
        return next;
      });
    },
    [rows, setSelectedIds],
  );

  return {
    location,
    locationDetails,
    filters,
    kpi,
    chartData,
    rows,
    allFiltered: sorted,
    filteredTotal: sorted.length,
    totalPages,
    hasActiveFilters,
    hydrated,
    selectedIds,
    openBarrier,
    setOpenId,
    setLocation,
    setFilter,
    setSort,
    resetFilters,
    showUrgent,
    toggleSelect,
    selectAll,
    selectPage,
    clearAll,
    visibleCols,
    hiddenPinned,
    toggleCol,
    moveCol,
    resetCols,
    togglePinned,
    // Client mode derives synchronously: never a global load, never a
    // background refresh. Present so DashboardSections can treat both modes
    // with one `dash.isRefreshing` contract.
    loading: false,
    isInitial: false,
    isRefreshing: false,
  };
}
