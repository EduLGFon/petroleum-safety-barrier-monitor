// Export summary - KPI strip stats and summary table from one computeKpi pass.
// This is why it exists: spreadsheet and print report share the same
// formatted totals, so exports always match the dashboard KPI cards. Both
// builders take a KpiSnapshot so the server can reuse an aggregate it
// already computed instead of buffering every row just to count them.
import { DISP_KNOWN_ORDER } from "../constants.ts";

import type { Barrier, KpiSnapshot } from "../types.ts";

import { computeKpi } from "../utils.ts";

import { fmt } from "../format.ts";

export interface KpiStats {
  total: string;
  compliant: string;
  nonCompliant: string;
  pct: string;
  critical: string;
}

// Derives pt-BR formatted KPI totals from a snapshot; zeros and 0% (no
// div-by-zero/NaN). Matches dashboard KPI exactly, including fail-closed
// novel values.
export function kpiStatsFrom(k: KpiSnapshot): KpiStats {
  const n = fmt;
  return {
    total: n(k.total),
    compliant: n(k.compliant),
    nonCompliant: n(k.nonCompliant),
    pct: `${k.pctCompliant}%`,
    critical: n(k.criticalNonCompliant),
  };
}

// kpiStats: snapshot flavour for callers that hold the rows (browser).
export function kpiStats(barriers: Barrier[]): KpiStats {
  return kpiStatsFrom(computeKpi(barriers));
}

// Builds the [label, value] summary table from a snapshot.
// Availability rows come from the dynamic bucket (known first in canonical
// order, novel values after by volume), so a new status can never go missing
// while the total still reconciles.
export function summaryRowsFrom(k: KpiSnapshot): Array<[string, string]> {
  const n = fmt;
  const byAvailability = k.byAvailability ?? {};
  const keys = Object.keys(byAvailability).sort((a, b) => {
    const ia = DISP_KNOWN_ORDER.indexOf(a), ib = DISP_KNOWN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return byAvailability[b] - byAvailability[a];
  });
  return [
    ["Total", n(k.total)],
    ...keys.map((key): [string, string] => [key, n(byAvailability[key] ?? 0)]),
    ["Conformes", n(k.compliant)],
    ["Não Conformes", n(k.nonCompliant)],
    ["Críticas NC", n(k.criticalNonCompliant)],
    ["% Conformidade", `${k.pctCompliant}%`],
  ];
}

// summaryRows: row flavour for callers that hold the rows (browser).
export function summaryRows(barriers: Barrier[]): Array<[string, string]> {
  return summaryRowsFrom(computeKpi(barriers));
}
