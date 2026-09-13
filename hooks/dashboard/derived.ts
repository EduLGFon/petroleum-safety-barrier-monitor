// derived.ts — dashboard derived memos (kpi/chart/rows/details); split out so composer stays state-only.
import {
  applyFilters,
  applySorting,
  computeChartData,
  computeKpi,
  paginate,
} from "../../lib/utils.ts";
import type { Barrier, FilterState } from "../../lib/types.ts";
import { LOCATIONS } from "../../lib/constants.ts";
import { useMemo } from "preact/hooks";

export function useDashboardDerived(
  allBarriers: Barrier[],
  location: string,
  filters: FilterState,
  openId: number | null,
) {
  const locationBarriers = useMemo(
    () =>
      location === "ALL"
        ? allBarriers
        : allBarriers.filter((b) => b.instalacao === location),
    [allBarriers, location],
  );

  const kpi = useMemo(() => computeKpi(locationBarriers), [locationBarriers]);
  const chartData = useMemo(() => computeChartData(locationBarriers), [
    locationBarriers,
  ]);
  const filtered = useMemo(
    () => applyFilters(locationBarriers, filters),
    [locationBarriers, filters],
  );
  const sorted = useMemo(() => applySorting(filtered, filters), [
    filtered,
    filters,
  ]);
  const rows = useMemo(
    () => paginate(sorted, filters.page, filters.pageSize),
    [sorted, filters],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(sorted.length / filters.pageSize),
  );

  const openBarrier = useMemo(
    () => openId ? allBarriers.find((b) => b.id === openId) ?? null : null,
    [openId, allBarriers],
  );
  // Station metadata comes from the seed list when known; stations added
  // later fall back to their own code so details never render undefined.
  const locationDetails = LOCATIONS.find((l) => l.code === location) ??
    (location !== "ALL"
      ? { code: location, name: location, tipo: "Instalação" }
      : LOCATIONS[0]);

  return {
    locationBarriers,
    kpi,
    chartData,
    filtered,
    sorted,
    rows,
    totalPages,
    openBarrier,
    locationDetails,
  };
}
