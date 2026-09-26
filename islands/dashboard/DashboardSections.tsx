// Dashboard sections - page shell with every dashboard section.
// Why: client (mock) and server (HTTP) modes share one render tree; only the
// data hook feeding `dash` differs. Settings defaults gate lives here too.
import type {
  AuthUser,
  Barrier,
  SyncChange,
  SyncStatus,
} from "../../lib/types.ts";

import { TableStatusRow } from "../../components/table/TableStatusRow.tsx";

import { DashboardFooter, DashboardOverlays } from "./DashboardChrome.tsx";

import { LocationFilter } from "../../components/LocationFilter.tsx";

import { ExportMenu } from "../../components/export/ExportMenu.tsx";

import { BarriersTable } from "../../components/BarriersTable.tsx";

import { useSettings } from "../../context/SettingsContext.tsx";

import type { useDashboard } from "../../hooks/useDashboard.ts";

import { useEffect, useMemo, useState } from "preact/hooks";

import { FilterBar } from "../../components/FilterBar.tsx";

import { sanitizeFilterPatch } from "../../lib/utils.ts";

import { Header } from "../../components/Header.tsx";

import { distinctBy } from "../../lib/constants.ts";

import { KpiSections } from "./KpiSections.tsx";

// Either data hook return, plus optional server-only fetch state.
// isInitial = first paint with zero rows (splash territory).
// isRefreshing = background refetch with stale rows kept (table-local shimmer).
export type Dash =
  & ReturnType<typeof useDashboard>
  & {
    loading?: boolean;
    isInitial?: boolean;
    isRefreshing?: boolean;
    error?: string | null;
    retry?: () => void;
  };

interface SectionsProps {
  dash: Dash;
  // Client mode: full list (tabs + counts derive from it). Server mode: the
  // loaded page plus precomputed stations/total from SSR vocabularies.
  barriers: Barrier[];
  stations?: { id: number; code: string; name: string; count: number }[];
  total?: number;
  dispOpts: string[];
  confOpts: string[];
  catOpts: string[];
  critOpts: string[];
  typoOpts: string[];
  visible: boolean;
  loading: boolean;
  companyName: string;
  serverMode: boolean;
  // Live sync status for the header health indicator (HTTP mode only).
  syncStatus?: SyncStatus | null;
  // Barriers touched by recent sync runs for the card's "what changed"
  // section (HTTP mode only; null hides the section).
  syncChanges?: SyncChange[] | null;
  // Authenticated session identity for the Header user menu. Null when the
  // island renders without SSR identity (never in production page flow).
  sessionUser?: AuthUser | null;
  // Origin of the API for the header health probe. Empty = same origin.
  apiBaseUrl?: string;
  // Server mode only: streams the full filtered set as CSV. Absent in mock
  // mode, where the toolbar exports the client-side rows instead.
  onServerCsv?: () => Promise<void>;
}

// DashboardSections: header, tabs, band, KPI, chart, alert, exports, table,
// footer, and overlays wired to one dash contract.
export function DashboardSections(
  {
    dash,
    barriers,
    stations,
    total,
    dispOpts,
    confOpts,
    catOpts,
    critOpts,
    typoOpts,
    visible,
    loading,
    companyName,
    serverMode,
    sessionUser = null,
    syncStatus = null,
    syncChanges = null,
    apiBaseUrl = "",
    onServerCsv,
  }: SectionsProps,
) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();
  const {
    location,
    filters,
    kpi,
    chartData,
    rows,
    allFiltered,
    filteredTotal,
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
    isRefreshing = false,
    visibleCols,
    hiddenPinned,
    toggleCol,
    moveCol,
    resetCols,
    togglePinned,
  } = dash;

  // Table entrance runs exactly once on mount (CSS animation on a stable
  // element replays only if remounted). Row updates animate inside
  // BarriersTable only, so the wrapper never yanks the viewport.

  // Header bulk scope: the table checkbox selects the page; the inline
  // prompt extends to the full filtered set. Server mode resolves all ids
  // through the adapter, client mode already holds the filtered list.
  const selectAllFiltered = (dash as unknown as {
    selectAllFiltered?: () => Promise<void>;
  }).selectAllFiltered ?? selectAll;

  // Apply settings default filters after hydration (once). The patch is
  // sanitized so a stale or tampered preset can never wedge the grid.
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (!hydrated || defaultsApplied || loading) return;
    setDefaultsApplied(true);
    // Only apply settings defaults if no persisted state existed
    const patch = sanitizeFilterPatch(settings.defaultFilters);
    if (Object.keys(patch).length > 0) {
      setFilter(patch);
    }
  }, [hydrated, defaultsApplied, loading, settings.defaultFilters, setFilter]);

  // Settings filter vocabularies are fully dynamic: server mode reuses the
  // SSR/live stations, client mode derives distinct stations from the loaded
  // list. No seed station list is used here, so new installations appear
  // without a code change.
  const settingLocations = useMemo(() => {
    if (stations && stations.length > 0) {
      return stations.map((s) => ({
        code: s.code,
        name: s.name || s.code,
        type: "",
      }));
    }
    const codes = [...new Set(barriers.map((b) => b.location))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    return codes.map((code) => ({ code, name: code, type: "" }));
  }, [stations, barriers]);

  // Unified NC count: every non-Conforme barrier (fail-closed, novel statuses
  // included) drives the alert, matching KpiGrid and the chart.
  const ncCount = kpi.nonCompliant;
  const isUrgentActive = filters.compliance === "Não Conforme" &&
    filters.sortCol === "statusSince";

  return (
    <>
      <div
        className="aurora-shell"
        style={{
          fontFamily: "var(--font-sans)",
          minHeight: "100dvh",
          padding: "var(--d-page)",
          boxSizing: "border-box",
          color: "var(--text-primary)",
          fontSize: "var(--d-page-fs)",
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(6px)",
          transition:
            "opacity .5s var(--ease-out), transform .5s var(--ease-out)",
        }}
      >
        {/* Header with merged connection + sync indicator */}
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          companyName={companyName}
          apiBaseUrl={apiBaseUrl}
          sessionUser={sessionUser}
          syncStatus={syncStatus ?? null}
          syncChanges={syncChanges ?? null}
        />

        {/* Location tabs */}
        <div style={{ animation: "slideUp .3s .04s var(--ease-out) both" }}>
          <LocationFilter
            selected={location}
            allBarriers={barriers}
            stations={stations}
            total={total}
            onChange={setLocation}
          />
        </div>

        {/* KPI band, cards, chart, and NC alert */}
        <KpiSections
          kpi={kpi}
          chartData={chartData}
          location={location}
          activeAvailability={filters.availability}
          onDispFilter={(v) => setFilter({ availability: v })}
          onSelectCategory={(v) =>
            setFilter({ category: filters.category === v ? "" : v })}
          activeCategory={filters.category}
          ncCount={ncCount}
          isUrgentActive={isUrgentActive}
          showUrgent={showUrgent}
          resetFilters={resetFilters}
        />

        {
          /* Filter row (filter-only) + status row (master checkbox, count
            / selection summary, filter reset) directly above the table. */
        }
        <div style={{ animation: "slideUp .3s .36s var(--ease-out) both" }}>
          <FilterBar
            filters={filters}
            vocabs={{
              typologies: typoOpts,
              categories: catOpts,
              availabilities: dispOpts,
              compliances: confOpts,
              criticalities: critOpts,
            }}
            hiddenPinned={hiddenPinned}
            isRefreshing={isRefreshing}
            onFilter={setFilter}
            visible={visibleCols}
            onToggleCol={toggleCol}
            onMoveCol={moveCol}
            onResetCols={resetCols}
            onTogglePinned={togglePinned}
            exportMenu={
              <ExportMenu
                selectedIds={selectedIds}
                allFiltered={allFiltered}
                pageRows={rows}
                companyName={companyName}
                serverMode={serverMode}
                onServerCsv={onServerCsv}
              />
            }
          />
          <TableStatusRow
            pageIds={rows.map((b) => b.id)}
            selectedIds={selectedIds}
            filteredTotal={filteredTotal}
            hasActiveFilters={hasActiveFilters}
            onSelectPage={selectPage}
            onSelectAll={selectAllFiltered}
            onClearAll={clearAll}
            onResetFilters={resetFilters}
          />
        </div>

        {
          /* Table - entrance runs once on mount; row/filter/page/pageSize
            updates animate inside BarriersTable. */
        }
        <div className="animate-slide-up-once">
          <BarriersTable
            rows={rows}
            filters={filters}
            filteredTotal={filteredTotal}
            totalPages={totalPages}
            selectedIds={selectedIds}
            visibleCols={visibleCols}
            isRefreshing={isRefreshing}
            onToggleSelect={toggleSelect}
            onSort={setSort}
            onPageChange={(p) => setFilter({ page: p })}
            onPageSize={(n) => setFilter({ pageSize: n })}
            onSelect={(b) => setOpenId(b.id)}
          />
        </div>

        <DashboardFooter />
      </div>

      <DashboardOverlays
        openBarrier={openBarrier}
        onCloseBarrier={() => setOpenId(null)}
        onBarrierSaved={() => dash.retry?.()}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        sessionUser={sessionUser}
        locations={settingLocations}
        availabilities={dispOpts}
        compliances={confOpts}
        categories={catOpts}
        criticalities={critOpts}
        typologies={typoOpts}
      />
    </>
  );
}
