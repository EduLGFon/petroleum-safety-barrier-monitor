// KPI sections - status band, KPI cards, chart, and NC alert.
// Why: one data-driven block (KPI snapshot + chart rows) shared verbatim by
// both dashboard modes; keeps DashboardSections to shell composition.
import type {
  CategoryCompliance,
  KpiSnapshot,
  RowScope,
} from "../../lib/types.ts";

import { ComplianceChart } from "../../components/ComplianceChart.tsx";

import { StatusBand } from "../../components/StatusBand.tsx";

import { KpiGrid } from "../../components/KpiGrid.tsx";

import { NcAlert } from "./NcAlert.tsx";

interface KpiSectionsProps {
  kpi: KpiSnapshot;
  chartData: CategoryCompliance[];
  activeAvailability: string;
  onDispFilter: (v: string) => void;
  // Chart row click-through: full category name ("" clears the filter).
  onSelectCategory: (v: string) => void;
  activeCategory: string;
  ncCount: number;
  isUrgentActive: boolean;
  showUrgent: () => void;
  resetFilters: () => void;
  // Visibility scope band segments (admin only; everyone else sees the
  // availability band alone).
  rowScope: RowScope;
  onRowScope: (s: RowScope) => void;
  isAdmin: boolean;
}

// KpiSections: availability band, cards, conformity chart, and NC alert.
export function KpiSections(
  {
    kpi,
    chartData,
    activeAvailability,
    onDispFilter,
    onSelectCategory,
    activeCategory,
    ncCount,
    isUrgentActive,
    showUrgent,
    resetFilters,
    rowScope,
    onRowScope,
    isAdmin,
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
          rowScope={rowScope}
          onRowScope={onRowScope}
          isAdmin={isAdmin}
        />
      </div>

      {/* KPI cards + criticality panel */}
      <KpiGrid kpi={kpi} />

      {/* Chart */}
      <div style={{ animation: "slideUp .3s .28s var(--ease-out) both" }}>
        <ComplianceChart
          data={chartData}
          onSelectCategory={onSelectCategory}
          activeCategory={activeCategory}
        />
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
