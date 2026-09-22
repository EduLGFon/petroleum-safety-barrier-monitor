// Server dashboard - HTTP-backed data with shared filter/selection semantics.
// This is why it exists: 50k+ rows cannot ship as island props. Pages, KPI,
// and chart load per scope change while filter state, persistence, selection,
// and the return contract stay identical to client (mock) mode.
import type {
  Barrier,
  CategoryCompliance,
  KpiSnapshot,
  Vocabularies,
} from "../../lib/types.ts";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { restoreSelection, useSelection } from "./selection.ts";

import { httpAdapterFactory } from "../../lib/api/http.ts";

import type { BarriersApi } from "../../lib/api/types.ts";

import { isAuthExpired } from "../../lib/api/http.ts";

import { loadDash, saveDash } from "./persistence.ts";

import { toWireQuery } from "../../lib/api/query.ts";

import { useFilterState } from "./filter-state.ts";

import { LOCATIONS } from "../../lib/constants.ts";

import { computeKpi } from "../../lib/utils.ts";

// toLoginWithReturn: sends an expired session back to /login preserving
// the current page, so the user lands where they were after signing in.
// Exported for the sync-status hook, which shares the same session fate.
export function toLoginWithReturn(): void {
  try {
    const here = globalThis.location.pathname + globalThis.location.search;
    globalThis.location.href = `/login?next=${encodeURIComponent(here)}`;
  } catch {
    // Non-browser (tests): nothing to redirect.
  }
}

// Server-driven dashboard store; same 22-key contract as useDashboard plus
// loading/error/retry. CSV export covers the full filtered set via the
// server endpoint (xls/pdf stay page-local client exports).
// adapterOverride lets tests inject a fake BarriersApi; callers using the real
// HTTP path stay untouched (it is just httpAdapterFactory(baseUrl)).
// vocabularies (server-provided) supply dynamic station/category id maps so
// imported values beyond the seed enums resolve and filter by id; refreshMs
// polls data + vocabularies on a cadence (0 disables, skips hidden tabs).
// Auth expiry (AuthExpiredError from the HTTP adapter) redirects to
// /login?next= so a dead session never strands the user on errors.
export function useServerDashboard(
  baseUrl: string,
  defaultLocation = "ALL",
  adapterOverride?: BarriersApi,
  vocabularies?: Vocabularies | null,
  refreshMs = 0,
) {
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
  // Dynamic id<->label maps derived from the live vocabulary (SSR seed,
  // refreshed on cadence); null in mock mode, where static enums apply.
  const [liveVocab, setLiveVocab] = useState<Vocabularies | null>(
    vocabularies ?? null,
  );
  // Picks up a fresh SSR vocabulary if the prop ever changes (navigation).
  useEffect(() => {
    if (vocabularies) setLiveVocab(vocabularies);
  }, [vocabularies]);
  const idMaps = useMemo(
    () =>
      liveVocab
        ? {
          resolve: {
            locations: Object.fromEntries(
              liveVocab.locations.map((l) => [l.id, l.code]),
            ) as Record<number, string>,
            categories: Object.fromEntries(
              liveVocab.categories.map((c) => [c.id, c.label]),
            ) as Record<number, string>,
          },
          query: {
            locationIds: Object.fromEntries(
              liveVocab.locations.map((l) => [l.code, l.id]),
            ) as Record<string, number>,
            categoryIds: Object.fromEntries(
              liveVocab.categories.map((c) => [c.label, c.id]),
            ) as Record<string, number>,
          },
        }
        : null,
    [liveVocab],
  );
  const adapter = useMemo(
    () => adapterOverride ?? httpAdapterFactory(baseUrl, idMaps?.resolve),
    [adapterOverride, baseUrl, idMaps],
  );

  const [items, setItems] = useState<Barrier[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [kpi, setKpi] = useState<KpiSnapshot>(() => computeKpi([]));
  const [chartData, setChartData] = useState<CategoryCompliance[]>([]);
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
  // dropped via cancellation so fast typing never renders stale data. KPI
  // and chart honor the same filters as the table (minus paging/sort).
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const wq = toWireQuery({
      location,
      availability: filters.availability || undefined,
      compliance: filters.compliance || undefined,
      category: filters.category || undefined,
      query: filters.query || undefined,
      since: filters.since || undefined,
      until: filters.until || undefined,
      page: filters.page,
      pageSize: filters.pageSize,
      sortCol: filters.sortCol,
      sortDir: filters.sortDir,
    }, idMaps?.query);
    const scope = {
      locationId: wq.locationId,
      availabilityId: wq.availabilityId,
      complianceId: wq.complianceId,
      categoryId: wq.categoryId,
      query: wq.query,
      since: wq.since,
      until: wq.until,
    };
    Promise.all([
      adapter.getBarriers(wq),
      adapter.getKpi(scope),
      adapter.getChartData(scope),
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
      // Dead session mid-use: back to login with a return ticket instead
      // of stranding the dashboard on an error banner.
      if (isAuthExpired(err)) {
        toLoginWithReturn();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, hydrated, location, filters, reloadKey, idMaps]);

  // Station metadata comes from the seed list when known; stations added
  // later fall back to their own code so details never render undefined.
  const locationDetails = useMemo(
    () =>
      LOCATIONS.find((l) => l.code === location) ??
        (location !== "ALL"
          ? { code: location, name: location, type: "Instalação" }
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

  // Cadence refresh: re-fires data + vocabulary on an interval; hidden tabs
  // skip the tick (no background churn) and refetch on return via reload.
  useEffect(() => {
    if (!refreshMs || refreshMs <= 0 || !hydrated) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setReloadKey((k) => k + 1);
      if (!baseUrl) return;
      fetch(`${baseUrl}/api/vocabularies`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      }).then((res) => {
        if (res.status === 401 || res.status === 404) {
          toLoginWithReturn();
          return;
        }
        if (!res.ok) return;
        return res.json() as Promise<Vocabularies>;
      }).then((v) => {
        if (v) setLiveVocab(v);
      }).catch(() => {
        // Vocabulary refresh is best-effort; the data reload above stands.
      });
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, hydrated, baseUrl]);

  // Exports the full filtered set as CSV through the server endpoint (the
  // 10k cap and over-cap message come from the server, surfaced by the
  // toolbar). xls/pdf stay client-side page exports.
  const exportServerCsv = useCallback(async () => {
    if (!baseUrl) throw new Error("Exportação indisponível (sem baseUrl)");
    const wq = toWireQuery({
      location,
      availability: filters.availability || undefined,
      compliance: filters.compliance || undefined,
      category: filters.category || undefined,
      query: filters.query || undefined,
      since: filters.since || undefined,
      until: filters.until || undefined,
      page: 1,
      pageSize: 10000,
      sortCol: filters.sortCol,
      sortDir: filters.sortDir,
    }, idMaps?.query);
    const qs = new URLSearchParams({ format: "csv" });
    for (const [k, v] of Object.entries(wq)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const res = await fetch(`${baseUrl}/api/export?${qs.toString()}`, {
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 404) {
      // Extraction on a dead session: re-login first, then retry export.
      toLoginWithReturn();
      throw new Error("Sessão expirada - entre novamente para exportar");
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json() as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        // Non-JSON error body; keep the status text.
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barreiras-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [baseUrl, location, filters, idMaps]);

  return {
    location,
    locationDetails,
    filters,
    kpi,
    chartData,
    rows: items,
    // Export covers the loaded page, except CSV which streams the full
    // filtered set from the server (see exportServerCsv).
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
    showUrgent,
    toggleSelect,
    selectAll,
    clearAll,
    loading,
    error,
    retry,
    exportServerCsv,
    // Live vocabulary (SSR seed, refreshed on cadence) for tabs and counts.
    liveVocabularies: liveVocab,
  };
}
