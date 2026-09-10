/**
 * ══════════════════════════════════════════════════════════════════════════
 * USE-DASHBOARD — central dashboard state + derived data for the main page
 * ══════════════════════════════════════════════════════════════════════════
 * Composer over dashboard slices (filter-state, selection, persistence,
 * derived): filter semantics, selection/open-row state with localStorage
 * persistence (SSR-safe hydration), and paged rows/KPI/chart derivations.
 * Sole data source for dashboard islands in client (mock) mode.
 */
import { loadDash, saveDash } from "./dashboard/persistence.ts";
import { useDashboardDerived } from "./dashboard/derived.ts";
import { useFilterState } from "./dashboard/filter-state.ts";
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
    showUrgentes,
  } = useFilterState(defaultLocation);
  const {
    selectedIds,
    setSelectedIds,
    openId,
    setOpenId,
    toggleSelect,
    clearAll,
  } = useSelection();

  // After mount: restore validated selection/openId (filters restore inside
  // useFilterState; corrupt values fall back instead of wedging state).
  useEffect(() => {
    const p = loadDash();
    if (Array.isArray(p.selectedIds)) {
      const ids = p.selectedIds.filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 10000);
      if (ids.length) setSelectedIds(new Set(ids));
    }
    if (Number.isInteger(p.openId) && (p.openId as number) > 0) {
      setOpenId(p.openId as number);
    }
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
    });
  }, [location, filters, hydrated, selectedIds, openId]);

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
    showUrgentes,
    toggleSelect,
    selectAll,
    clearAll,
  };
}
