// Dashboard island - interactive monitor wired to filters, table and exports.
// This is why it exists: the only hydrated root; everything static stays
// in components/ so the client ships JS for this subtree alone.
import { SettingsProvider, useSettings } from "../context/SettingsContext.tsx";
import { AlertTriangleIcon, ArrowRightIcon } from "../components/ui/Icons.tsx";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { ConformidadeChart } from "../components/ConformidadeChart.tsx";
import { LocationFilter } from "../components/LocationFilter.tsx";
import { ExportToolbar } from "../components/ExportToolbar.tsx";
import { BarriersTable } from "../components/BarriersTable.tsx";
import { LoadingScreen } from "../components/LoadingScreen.tsx";
import { SettingsPanel } from "../components/SettingsPanel.tsx";
import { BarrierModal } from "../components/BarrierModal.tsx";
import { ThemeProvider } from "../context/ThemeContext.tsx";
import { StatusBand } from "../components/StatusBand.tsx";
import { useDashboard } from "../hooks/useDashboard.ts";
import { FilterBar } from "../components/FilterBar.tsx";
import { sanitizeFilterPatch } from "../lib/utils.ts";
import { KpiGrid } from "../components/KpiGrid.tsx";
import { Header } from "../components/Header.tsx";
import { distinctBy } from "../lib/constants.ts";
import type { Barrier } from "../lib/types.ts";
import { withBrand } from "../lib/company.ts";

interface Props {
  initialBarriers: Barrier[];
  companyName: string;
}

// Dashboard: island root; wraps DashboardView in Settings + Theme providers since server route context does not reach hydrated islands.
export function Dashboard({ initialBarriers, companyName }: Props) {
  // Providers must wrap the island content itself: context from a server
  // route does not reach island code when it hydrates in the browser.
  return (
    <SettingsProvider>
      <ThemeProvider>
        <DashboardView
          initialBarriers={initialBarriers}
          companyName={companyName}
        />
      </ThemeProvider>
    </SettingsProvider>
  );
}

// DashboardView: wires useDashboard state to filters/table/exports; derives live select vocabularies and applies settings defaults once after hydration.
function DashboardView({ initialBarriers: barriers, companyName }: Props) {
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

  // Live vocabularies for the filter selects - derived from the dataset so
  // new statuses/categories become filterable with no code change.
  const dispOpts = useMemo(
    () => distinctBy(barriers, (b) => b.disponibilidade),
    [barriers],
  );
  const confOpts = useMemo(
    () => distinctBy(barriers, (b) => b.conformidade),
    [barriers],
  );
  const catOpts = useMemo(
    () => distinctBy(barriers, (b) => b.categoria),
    [barriers],
  );

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
        {ncCount > 0 && (
          <div
            className="animate-fade-in glass-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-gap)",
              padding: "var(--d-alert-pad)",
              marginBottom: "var(--d-stack)",
              background: "var(--alert-nc-bg)",
              border: "1px solid var(--alert-nc-border)",
              borderRadius: 12,
              boxShadow: "0 0 24px rgba(239,68,68,.25)",
              animationDelay: ".32s",
            }}
          >
            <AlertTriangleIcon
              size={18}
              color="var(--alert-nc-text)"
              strokeWidth={2}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "var(--d-lead)",
                  fontWeight: 700,
                  color: "var(--alert-nc-text)",
                }}
              >
                {ncCount.toLocaleString("pt-BR")}{" "}
                barreira{ncCount > 1 ? "s" : ""}{" "}
                não conforme{ncCount > 1 ? "s" : ""}
              </div>
              <div
                style={{
                  fontSize: "var(--d-small)",
                  color: "var(--alert-nc-sub)",
                  marginTop: 2,
                }}
              >
                Degradadas, indisponíveis ou novos status · ordenadas da mais
                urgente
              </div>
            </div>
            <button
              type="button"
              className="lift"
              onClick={() => isUrgentesActive ? resetFilters() : showUrgentes()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--d-gap-xs)",
                fontSize: "var(--d-small)",
                fontWeight: 700,
                padding: "var(--d-alert-btn)",
                borderRadius: "var(--d-btn-radius)",
                background:
                  "color-mix(in srgb,var(--alert-nc-text) 12%,transparent)",
                border:
                  "1px solid color-mix(in srgb,var(--alert-nc-text) 35%,transparent)",
                color: "var(--alert-nc-text)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {isUrgentesActive ? "Limpar filtro" : (
                <>
                  <ArrowRightIcon
                    size={12}
                    color="var(--alert-nc-text)"
                    strokeWidth={2.5}
                  />{" "}
                  Ver urgentes
                </>
              )}
            </button>
          </div>
        )}

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

        <div
          className="tnum"
          style={{
            marginTop: "var(--d-foot-gap)",
            textAlign: "center",
            fontSize: "var(--d-caption)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            animation: "fadeInFast .4s .5s both",
          }}
        >
          {withBrand(companyName, "Monitor de Barreiras de Segurança")}
        </div>
      </div>

      <BarrierModal barrier={openBarrier} onClose={() => setOpenId(null)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        companyName={companyName}
      />
    </>
  );
}
