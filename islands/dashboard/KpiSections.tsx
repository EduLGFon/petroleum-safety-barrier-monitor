// KPI sections - status band, KPI cards, chart, and NC alert.
// Why: one data-driven block (KPI snapshot + chart rows) shared verbatim by
// both dashboard modes; keeps DashboardSections to shell composition.
import { ConformidadeChart } from "../../components/ConformidadeChart.tsx";
import { StatusBand } from "../../components/StatusBand.tsx";
import { KpiGrid } from "../../components/KpiGrid.tsx";
import type { CategoryConformidade, KpiSnapshot } from "../../lib/types.ts";
import { NcAlert } from "./NcAlert.tsx";

interface KpiSectionsProps {
  kpi: KpiSnapshot;
  chartData: CategoryConformidade[];
  location: string;
  activeDisponibilidade: string;
  onDispFilter: (v: string) => void;
  ncCount: number;
  isUrgentesActive: boolean;
  showUrgentes: () => void;
  resetFilters: () => void;
}

// KpiSections: availability band, cards, conformity chart, and NC alert.
export function KpiSections(
  {
    kpi,
    chartData,
    location,
    activeDisponibilidade,
    onDispFilter,
    ncCount,
    isUrgentesActive,
    showUrgentes,
    resetFilters,
  }: KpiSectionsProps,
) {
  return (
    <>
      {/* Status band */}
      <div style={{ animation: "slideUp .3s .08s var(--ease-out) both" }}>
        <StatusBand
          kpi={kpi}
          activeFilter={activeDisponibilidade}
          onFilter={onDispFilter}
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
    </>
  );
}
