// KPI sections - status band, KPI cards, chart, and NC alert.
// Why: one data-driven block (KPI snapshot + chart rows) shared verbatim by
// both dashboard modes; keeps DashboardSections to shell composition.
import { ConformidadeChart } from "../../components/ConformidadeChart.tsx";

import type { CategoryCompliance, KpiSnapshot } from "../../lib/types.ts";

import { StatusBand } from "../../components/StatusBand.tsx";

import { KpiGrid } from "../../components/KpiGrid.tsx";

import { NcAlert } from "./NcAlert.tsx";

interface KpiSectionsProps {
  kpi: KpiSnapshot;
  chartData: CategoryCompliance[];
  location: string;
  activeAvailability: string;
  onDispFilter: (v: string) => void;
  ncCount: number;
  isUrgentActive: boolean;
  showUrgent: () => void;
  resetFilters: () => void;
}

// KpiSections: availability band, cards, conformity chart, and NC alert.
export function KpiSections(
  {
    kpi,
    chartData,
    location,
    activeAvailability,
    onDispFilter,
    ncCount,
    isUrgentActive,
    showUrgent,
    resetFilters,
  }: KpiSectionsProps,
) {
  return (
    <>
      {/* Status band */}
      <div style={{ animation: "slideUp .3s .08s var(--ease-out) both" }}>
        <StatusBand
          kpi={kpi}
          activeFilter={activeAvailability}
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
        isUrgentActive={isUrgentActive}
        showUrgent={showUrgent}
        resetFilters={resetFilters}
      />
    </>
  );
}
