// DashboardView - interactive monitor sections wired to filters, table and exports.
// Why: split from islands/Dashboard.tsx so the island root stays slim while this view keeps all state and effects intact.
import { DashboardFooter, DashboardOverlays } from "./DashboardChrome.tsx";
import { ConformidadeChart } from "../../components/ConformidadeChart.tsx";
import { LocationFilter } from "../../components/LocationFilter.tsx";
import { LoadingScreen } from "../../components/LoadingScreen.tsx";
import { ExportToolbar } from "../../components/ExportToolbar.tsx";
import { BarriersTable } from "../../components/BarriersTable.tsx";
import { useSettings } from "../../context/SettingsContext.tsx";
import { useCallback, useEffect, useState } from "preact/hooks";
import { useDashboardVocabularies } from "./vocabularies.ts";
import { StatusBand } from "../../components/StatusBand.tsx";
import { useDashboard } from "../../hooks/useDashboard.ts";
import { FilterBar } from "../../components/FilterBar.tsx";
import { sanitizeFilterPatch } from "../../lib/utils.ts";
import { KpiGrid } from "../../components/KpiGrid.tsx";
import { Header } from "../../components/Header.tsx";
import type { Barrier } from "../../lib/types.ts";
import { NcAlert } from "./NcAlert.tsx";

interface Props {
  initialBarriers: Barrier[];
  companyName: string;
}

// DashboardView: wires useDashboard state to filters/table/exports; derives live select vocabularies and applies settings defaults once after hydration.
export function DashboardView(
  { initialBarriers: barriers, companyName }: Props,
) {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();

  // handleLoadDone: exits LoadingScreen then fades the shell in via rAF + short delay; stable callback for LoadingScreen onDone.
  const handleLoadDone = useCallback(() => {
    setLoading(false);
    // Short delay then fade in — smoother than instant
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 30));
  }, []);

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
    showUrgentes,
    toggleSelect,
    selectAll,
    clearAll,
  } = useDashboard(barriers, settings.defaultLocation);

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

  // Unified NC count: every non-Conforme barrier (fail-closed, novel statuses
  // included) drives the alert, matching KpiGrid and the chart.
  const ncCount = kpi.naoConforme;
  const isUrgentesActive = filters.conformidade === "Não Conforme" &&
    filters.sortCol === "statusSince";

  const { dispOpts, confOpts, catOpts } = useDashboardVocabularies(barriers);

  return (
    <>
      {loading && (
        <LoadingScreen onDone={handleLoadDone} companyName={companyName} />
      )}

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
        {/* Header */}
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          companyName={companyName}
        />

        {/* Location tabs */}
        <div style={{ animation: "slideUp .3s .04s var(--ease-out) both" }}>
          <LocationFilter
            selected={location}
            allBarriers={barriers}
            onChange={setLocation}
          />
        </div>

        {/* Status band */}
        <div style={{ animation: "slideUp .3s .08s var(--ease-out) both" }}>
          <StatusBand
            kpi={kpi}
            activeFilter={filters.disponibilidade}
            onFilter={(v) => setFilter({ disponibilidade: v })}
          />
        </div>

        {/* KPI cards */}
        <KpiGrid kpi={kpi} location={location} />

        {/* Chart */}
        <div style={{ animation: "slideUp .3s .28s var(--ease-out) both" }}>
          <ConformidadeChart data={chartData} />
        </div>

        {/* NC alert - red glass with the signature red glow */}
        <NcAlert
          ncCount={ncCount}
          isUrgentesActive={isUrgentesActive}
          showUrgentes={showUrgentes}
          resetFilters={resetFilters}
        />

        {/* Export toolbar + filters */}
        <div style={{ animation: "slideUp .3s .36s var(--ease-out) both" }}>
          <ExportToolbar
            selectedIds={selectedIds}
            allFiltered={allFiltered}
            onSelectAll={selectAll}
            onClearAll={clearAll}
            companyName={companyName}
          />
          <FilterBar
            filters={filters}
            filteredTotal={filteredTotal}
            hasActiveFilters={hasActiveFilters}
            disponibilidades={dispOpts}
            conformidades={confOpts}
            categorias={catOpts}
            onFilter={setFilter}
            onReset={resetFilters}
          />
        </div>

        {/* Table */}
        <div style={{ animation: "slideUp .3s .4s var(--ease-out) both" }}>
          <BarriersTable
            rows={rows}
            filters={filters}
            filteredTotal={filteredTotal}
            totalPages={totalPages}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSort={setSort}
            onPageChange={(p) => setFilter({ page: p })}
            onPageSize={(n) => setFilter({ pageSize: n })}
            onSelect={(b) => setOpenId(b.id)}
          />
        </div>

        <DashboardFooter companyName={companyName} />
      </div>

      <DashboardOverlays
        openBarrier={openBarrier}
        onCloseBarrier={() => setOpenId(null)}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        companyName={companyName}
      />
    </>
  );
}
