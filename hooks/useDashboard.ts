/**
 * ══════════════════════════════════════════════════════════════════════════
 * USE-DASHBOARD — central dashboard state + derived data for the main page
 * ══════════════════════════════════════════════════════════════════════════
 * Reducer for location/filters/sort, selection and open-row state with
 * localStorage persistence (SSR-safe hydration). Derives kpi, chartData,
 * and paged rows via lib/utils.ts; sole data source for dashboard islands.
 */

import {
  applyFilters,
  applySorting,
  computeChartData,
  computeKpi,
  defaultFilters,
  paginate,
} from "../lib/utils.ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "preact/hooks";
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { LOCATIONS } from "../lib/constants.ts";

const STORE_KEY = "barrier-dashboard";

interface Persisted {
  location: string;
  filters: FilterState;
  selectedIds: number[];
  openId: number | null;
}

// Loads persisted dashboard slice from `barrier-dashboard` key; SSR-safe, returns {} on miss/error.
function loadDash(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

// Persists dashboard slice to `barrier-dashboard` key; no-op on storage failure, state stays in memory.
function saveDash(d: Persisted) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    // Storage may be unavailable - dashboard still works in memory.
  }
}

type Action =
  | { type: "SET_LOCATION"; payload: string }
  | { type: "SET_FILTER"; payload: Partial<FilterState> }
  | { type: "SET_SORT"; payload: SortableColumn }
  | { type: "RESET_FILTERS" }
  | { type: "RESTORE"; payload: Partial<FilterState> & { location?: string } };

interface State {
  location: string;
  filters: FilterState;
}

// Pure reducer for location/filters/sort; resets page to 1 except on page-only navigation.
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "SET_LOCATION":
      return { ...s, location: a.payload, filters: { ...s.filters, page: 1 } };
    case "SET_FILTER": {
      const keys = Object.keys(a.payload);
      // Only reset to page 1 when a real filter changed (not a page navigation)
      const isPageOnly = keys.length === 1 && keys[0] === "page";
      const newPage = isPageOnly ? (a.payload.page ?? 1) : 1;
      return { ...s, filters: { ...s.filters, ...a.payload, page: newPage } };
    }
    case "SET_SORT": {
      const col = a.payload,
        dir = s.filters.sortCol === col && s.filters.sortDir === "asc"
          ? "desc"
          : "asc";
      return { ...s, filters: { ...s.filters, sortCol: col, sortDir: dir } };
    }
    case "RESET_FILTERS":
      return { ...s, filters: defaultFilters() };
    case "RESTORE": {
      const { location, ...rest } = a.payload;
      return {
        location: location ?? s.location,
        filters: { ...s.filters, ...rest },
      };
    }
    default:
      return s;
  }
}

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

  // After mount: restore persisted state
  useEffect(() => {
    const p = loadDash();
    dispatch({
      type: "RESTORE",
      payload: {
        location: p.location ?? defaultLocation,
        ...(p.filters ?? {}),
      },
    });
    if (p.selectedIds?.length) setSelectedIds(new Set(p.selectedIds));
    if (p.openId) setOpenId(p.openId);
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

  const locationBarriers = useMemo(
    () =>
      state.location === "ALL"
        ? allBarriers
        : allBarriers.filter((b) => b.instalacao === state.location),
    [allBarriers, state.location],
  );

  const kpi = useMemo(() => computeKpi(locationBarriers), [locationBarriers]);
  const chartData = useMemo(() => computeChartData(locationBarriers), [
    locationBarriers,
  ]);
  const filtered = useMemo(
    () => applyFilters(locationBarriers, state.filters),
    [locationBarriers, state.filters],
  );
  const sorted = useMemo(() => applySorting(filtered, state.filters), [
    filtered,
    state.filters,
  ]);
  const rows = useMemo(
    () => paginate(sorted, state.filters.page, state.filters.pageSize),
    [sorted, state.filters],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(sorted.length / state.filters.pageSize),
  );

  const openBarrier = useMemo(
    () => openId ? allBarriers.find((b) => b.id === openId) ?? null : null,
    [openId, allBarriers],
  );
  // Station metadata comes from the seed list when known; stations added
  // later fall back to their own code so details never render undefined.
  const locationDetails = LOCATIONS.find((l) => l.code === state.location) ??
    (state.location !== "ALL"
      ? { code: state.location, name: state.location, tipo: "Instalação" }
      : LOCATIONS[0]);

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
