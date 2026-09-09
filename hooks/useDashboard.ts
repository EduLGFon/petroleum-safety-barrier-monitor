/**
 * ══════════════════════════════════════════════════════════════════════════
 * USE-DASHBOARD — central dashboard state + derived data for the main page
 * ══════════════════════════════════════════════════════════════════════════
 * Reducer for location/filters/sort, selection and open-row state with
 * localStorage persistence (SSR-safe hydration). Derives kpi, chartData,
 * and paged rows via lib/utils.ts; sole data source for dashboard islands.
 */

import { useCallback, useEffect, useReducer, useState } from "preact/hooks";
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { defaultFilters, sanitizeFilters } from "../lib/utils.ts";
import { loadDash, saveDash } from "./dashboard/persistence.ts";
import { useDashboardDerived } from "./dashboard/derived.ts";
import { reducer } from "./dashboard/reducer.ts";

// Central dashboard store; starts from defaults for SSR, hydrates from `barrier-dashboard` after mount.
// Persists location/filters/selection/openId via saveDash once hydrated.
export function useDashboard(allBarriers: Barrier[], defaultLocation = "ALL") {
  // Always start with consistent defaults for SSR — restore after mount
  const [state, dispatch] = useReducer(reducer, {
    location: "ALL",
    filters: defaultFilters(),
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // After mount: restore validated persisted state (corrupt values fall back
  // to defaults instead of wedging filters, page, or selection).
  useEffect(() => {
    const p = loadDash();
    const location = typeof p.location === "string" && p.location.trim() !== ""
      ? p.location
      : defaultLocation;
    const filters = sanitizeFilters(p.filters ?? {});
    dispatch({ type: "RESTORE", payload: { location, ...filters } });
    if (Array.isArray(p.selectedIds)) {
      const ids = p.selectedIds.filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 10000);
      if (ids.length) setSelectedIds(new Set(ids));
    }
    if (Number.isInteger(p.openId) && (p.openId as number) > 0) {
      setOpenId(p.openId as number);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    saveDash({
      location: state.location,
      filters: state.filters,
      selectedIds: [...selectedIds],
      openId,
    });
  }, [state, selectedIds, openId, hydrated]);

  const {
    kpi,
    chartData,
    sorted,
    rows,
    totalPages,
    openBarrier,
    locationDetails,
  } = useDashboardDerived(allBarriers, state.location, state.filters, openId);

  // Sets location and clears selection; persisted via saveDash effect.
  const setLocation = useCallback((code: string) => {
    dispatch({ type: "SET_LOCATION", payload: code });
    setSelectedIds(new Set());
  }, []);
  // Patches filters (resets page unless page-only); persisted via saveDash effect.
  const setFilter = useCallback(
    (patch: Partial<FilterState>) =>
      dispatch({ type: "SET_FILTER", payload: patch }),
    [],
  );
  // Toggles sort direction for column; persisted via saveDash effect.
  const setSort = useCallback(
    (col: SortableColumn) => dispatch({ type: "SET_SORT", payload: col }),
    [],
  );
  // Resets filters to defaults and clears selection; persisted via saveDash effect.
  const resetFilters = useCallback(() => {
    dispatch({ type: "RESET_FILTERS" });
    setSelectedIds(new Set());
  }, []);

  // Self-heals a stale persisted page (e.g. page 5 restored against a
  // now-1-page result): clamps and persists the fix instead of trapping the
  // user on an empty table with a hidden pager. Guarded, so no loop.
  useEffect(() => {
    if (!hydrated) return;
    if (state.filters.page > totalPages) setFilter({ page: totalPages });
  }, [hydrated, state.filters.page, totalPages, setFilter]);

  /** Show NC barriers sorted oldest-first (most urgent) */
  const showUrgentes = useCallback(() => {
    dispatch({
      type: "SET_FILTER",
      payload: {
        disponibilidade: "",
        conformidade: "Não Conforme",
        sortCol: "statusSince" as SortableColumn,
        sortDir: "asc",
        page: 1,
      },
    });
  }, []);

  // Toggles single-row selection; persisted as selectedIds via saveDash effect.
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);
  // Selects all currently filtered rows; persisted as selectedIds via saveDash effect.
  const selectAll = useCallback(
    () => setSelectedIds(new Set(sorted.map((b) => b.id))),
    [sorted],
  );
  // Clears all row selection; persisted via saveDash effect.
  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const hasActiveFilters = !!state.filters.query ||
    !!state.filters.disponibilidade || !!state.filters.conformidade ||
    !!state.filters.categoria;

  return {
    location: state.location,
    locationDetails,
    filters: state.filters,
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
