// Server dashboard - HTTP-backed data with shared filter/selection semantics.
// This is why it exists: 50k+ rows cannot ship as island props. Pages, KPI,
// and chart load per scope change while filter state, persistence, selection,
// and the return contract stay identical to client (mock) mode.
import type {
  Barrier,
  CategoryCompliance,
  FilterState,
  KpiSnapshot,
  Vocabularies,
} from "../../lib/types.ts";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { restoreSelection, useSelection } from "./selection.ts";

import { httpAdapterFactory } from "../../lib/api/http.ts";

import type { BarriersApi } from "../../lib/api/types.ts";

import { useVisibleColumns } from "./visible-columns.ts";

import { filterScope, scopeWireQuery } from "./scope.ts";

import { exportFromServer } from "./export-server.ts";

import type { Fmt } from "../../lib/export/format.ts";

import { isAuthExpired } from "../../lib/api/http.ts";

import { loadDash, saveDash } from "./persistence.ts";

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
// loading/error/retry. Every export format goes through the server endpoint
// over the whole selection (see exportServer), so 18k selected barriers
// export completely even though the browser only holds one page.
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
    setFilter: setFil,
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
            // Installation typologies beyond the seed enum resolve to real
            // labels; absent keeps seed fallback.
            typologies: Object.fromEntries(
              (liveVocab.typologies ?? []).map((t) => [t.id, t.label]),
            ) as Record<number, string>,
            // History authors (e.g. admin-created names past the seed
            // enum) resolve to real names; absent keeps seed fallback.
            authors: Object.fromEntries(
              (liveVocab.authors ?? []).map((a) => [a.id, a.name]),
            ) as Record<number, string>,
          },
          query: {
            locationIds: Object.fromEntries(
              liveVocab.locations.map((l) => [l.code, l.id]),
            ) as Record<string, number>,
            categoryIds: Object.fromEntries(
              liveVocab.categories.map((c) => [c.label, c.id]),
            ) as Record<string, number>,
            typologyIds: Object.fromEntries(
              (liveVocab.typologies ?? []).map((t) => [t.label, t.id]),
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

  // Export scope: the same filters the table shows, without paging. Shared by
  // the data fetch, select-all and the export so all three always agree.
  const scopeQuery = useMemo(
    () => scopeWireQuery(location, filters, idMaps?.query),
    [location, filters, idMaps],
  );

  // Fetch page + KPI + chart on scope change; superseded responses are
  // dropped via cancellation so fast typing never renders stale data. KPI
  // and chart honor the same filters as the table (minus paging/sort).
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const wq = {
      ...scopeQuery,
      page: filters.page,
      pageSize: filters.pageSize,
    };
    const scope = filterScope(wq);
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
  }, [
    adapter,
    hydrated,
    scopeQuery,
    filters.page,
    filters.pageSize,
    reloadKey,
  ]);

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
  // Resets filters and the station tab to defaults, and clears selection;
  // persisted via saveDash effect.
  const resetFilters = useCallback(() => {
    resetFil();
    clearAll();
  }, [resetFil, clearAll]);
  // Patches filters; a visibility-scope change clears the selection so ids
  // from one scope never leak into another scope's export.
  const setFilter = useCallback((patch: Partial<FilterState>) => {
    if (patch.rowScope !== undefined) clearAll();
    setFil(patch);
  }, [setFil, clearAll]);

  // Self-heals a stale persisted page: clamps and persists the fix instead of
  // trapping the user on an empty table with a hidden pager. Guarded, no loop.
  useEffect(() => {
    if (!hydrated) return;
    if (filters.page > pages) setFil({ page: pages });
  }, [hydrated, filters.page, pages, setFil]);

  // Selects all rows on the current page; persisted via saveDash effect.
  const selectAll = useCallback(
    () => setSelectedIds(new Set(items.map((b) => b.id))),
    [items, setSelectedIds],
  );

  // Merges the current page into the selection (header checkbox action).
  const selectPage = useCallback(
    () => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const b of items) next.add(b.id);
        return next;
      });
    },
    [items, setSelectedIds],
  );

  // Selects every row matching the current filter scope (Gmail-style
  // "select all that match") by resolving all ids through the adapter.
  // Page-local selectAll stays for the toolbar contract; the table header
  // prompt calls this to extend a page selection to the full filtered set.
  const selectAllFiltered = useCallback(async () => {
    const all = await adapter.getAllBarriers(scopeQuery);
    setSelectedIds(new Set(all.map((b) => b.id)));
  }, [adapter, scopeQuery, setSelectedIds]);

  // Detail resolves from the current page; when the id is not on this page
  // (e.g. opened from the sync-changes modal), fetch it on demand so the
  // modal still opens. The fetched row clears on page hit or close.
  // reloadKey is a dep so a post-sync refresh re-resolves an off-page row
  // instead of leaving a stale snapshot open.
  const [fetchedBarrier, setFetchedBarrier] = useState<Barrier | null>(null);
  const pageHit = openId ? items.find((b) => b.id === openId) ?? null : null;
  useEffect(() => {
    if (!openId || pageHit) {
      setFetchedBarrier(null);
      return;
    }
    let cancelled = false;
    adapter.getBarrierById(openId).then((b) => {
      if (!cancelled) setFetchedBarrier(b);
    }).catch(() => {
      if (!cancelled) setFetchedBarrier(null);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, openId, pageHit, reloadKey]);
  const openBarrier = pageHit ?? fetchedBarrier;

  // Split loading into initial vs refresh so row updates (filter/page/search/
  // pageSize) keep stale rows on screen instead of flashing the full splash.
  // Initial = first paint with zero rows; refreshing = background refetch
  // with stale rows still visible.
  const isInitial = loading && items.length === 0;
  const isRefreshing = loading && items.length > 0;

  // Retries the current scope after a fetch failure.
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // Best-effort vocabulary refresh (station counts + filter options). Shared
  // by the cadence timer and post-sync refreshAll so tabs/counts never stay
  // stale after a run while the table already reloaded.
  const refreshVocab = useCallback(() => {
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
      if (!v) return;
      // Keep object identity when the payload is unchanged so the adapter
      // memo (and its data effect) does not refetch a second time on top of
      // the reloadKey bump above.
      setLiveVocab((prev) =>
        prev !== null && JSON.stringify(prev) === JSON.stringify(v) ? prev : v
      );
    }).catch(() => {
      // Vocabulary refresh is best-effort; the data reload above stands.
    });
  }, [baseUrl]);

  // Full post-sync refresh: page + KPI + chart (via reloadKey) together with
  // vocabularies, so every number on the monitor moves at once without a
  // page reload. Call this when a sync run finishes.
  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1);
    refreshVocab();
  }, [refreshVocab]);

  // Cadence refresh: re-fires data + vocabulary on an interval; hidden tabs
  // skip the tick (no background churn) and refetch on return via reload.
  useEffect(() => {
    if (!refreshMs || refreshMs <= 0 || !hydrated) return;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setReloadKey((k) => k + 1);
      refreshVocab();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, hydrated, refreshVocab]);

  // Exports the whole selection through /api/export: every format covers
  // every selected barrier as one file download (the server streams the
  // rows, so the browser never holds them), and an empty selection covers
  // the filtered scope.
  const exportServer = useCallback(
    (kind: Fmt, ids: number[], filename: string) =>
      exportFromServer({
        baseUrl,
        kind,
        ids,
        filename,
        query: scopeQuery,
        onExpired: toLoginWithReturn,
      }),
    [baseUrl, scopeQuery],
  );

  return {
    location,
    locationDetails,
    filters,
    kpi,
    chartData,
    rows: items,
    // Export does not read this list: it asks the server for the whole
    // selection (see exportServer), so the loaded page never caps a file.
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
    selectPage,
    selectAllFiltered,
    clearAll,
    visibleCols,
    hiddenPinned,
    toggleCol,
    moveCol,
    resetCols,
    togglePinned,
    loading,
    isInitial,
    isRefreshing,
    error,
    retry,
    refreshVocab,
    refreshAll,
    exportServer,
    // Live vocabulary (SSR seed, refreshed on cadence) for tabs and counts.
    liveVocabularies: liveVocab,
  };
}
