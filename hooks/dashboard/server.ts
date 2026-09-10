// Server dashboard - HTTP-backed data with shared filter/selection semantics.
// This is why it exists: 50k+ rows cannot ship as island props. Pages, KPI,
// and chart load per scope change while filter state, persistence, selection,
// and the return contract stay identical to client (mock) mode.
import type {
  Barrier,
  CategoryConformidade,
  FilterState,
  KpiSnapshot,
} from "../../lib/types.ts";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { loadDash, saveDash } from "./persistence.ts";
import { restoreSelection, useSelection } from "./selection.ts";
import { useFilterState } from "./filter-state.ts";
import { httpAdapterFactory } from "../../lib/api/http.ts";
import { toWireQuery } from "../../lib/api/query.ts";
import { computeKpi } from "../../lib/utils.ts";
import { LOCATIONS } from "../../lib/constants.ts";

// Server-driven dashboard store; same 22-key contract as useDashboard plus
// loading/error/retry. Export covers the current page only (see note below).
export function useServerDashboard(baseUrl: string, defaultLocation = "ALL") {
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
  const adapter = useMemo(() => httpAdapterFactory(baseUrl), [baseUrl]);

  const [items, setItems] = useState<Barrier[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [kpi, setKpi] = useState<KpiSnapshot>(() => computeKpi([]));
  const [chartData, setChartData] = useState<CategoryConformidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
    });
  }, [location, filters, hydrated, selectedIds, openId]);

  // Fetch page + KPI + chart on scope change; superseded responses are
  // dropped via cancellation so fast typing never renders stale data.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const wq = toWireQuery({
      location,
      disponibilidade: filters.disponibilidade || undefined,
      conformidade: filters.conformidade || undefined,
      categoria: filters.categoria || undefined,
      query: filters.query || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
      sortCol: filters.sortCol,
      sortDir: filters.sortDir,
    });
    Promise.all([
      adapter.getBarriers(wq),
      adapter.getKpi({ locationId: wq.locationId }),
      adapter.getChartData({ locationId: wq.locationId }),
    ]).then(([page, snapshot, chart]) => {
      if (cancelled) return;
      setItems(page.items);
      setTotal(page.total);
      setPages(page.totalPages);
      setKpi(snapshot);
      setChartData(chart);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, hydrated, location, filters, reloadKey]);

  // Station metadata comes from the seed list when known; stations added
  // later fall back to their own code so details never render undefined.
  const locationDetails = useMemo(
    () =>
      LOCATIONS.find((l) => l.code === location) ??
        (location !== "ALL"
          ? { code: location, name: location, tipo: "Instalação" }
          : LOCATIONS[0]),
    [location],
  );

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

  // Self-heals a stale persisted page: clamps and persists the fix instead of
  // trapping the user on an empty table with a hidden pager. Guarded, no loop.
  useEffect(() => {
    if (!hydrated) return;
    if (filters.page > pages) setFilter({ page: pages });
  }, [hydrated, filters.page, pages, setFilter]);

  // Selects all rows on the current page; persisted via saveDash effect.
  const selectAll = useCallback(
    () => setSelectedIds(new Set(items.map((b) => b.id))),
    [items, setSelectedIds],
  );

  // Detail resolves from the current page only; a persisted id from another
  // page re-resolves when the user navigates back to it.
  const openBarrier = openId
    ? items.find((b) => b.id === openId) ?? null
    : null;

  // Retries the current scope after a fetch failure.
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    location,
    locationDetails,
    filters,
    kpi,
    chartData,
    rows: items,
    // Export covers the loaded page in server mode (full-dataset export
    // stays a mock-mode capability until a server export endpoint exists).
    allFiltered: items,
    filteredTotal: total,
    totalPages: pages,
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
    loading,
    error,
    retry,
  };
}
