// Export summary - KPI strip stats and summary table from one computeKpi pass.
// This is why it exists: spreadsheet and print report share the same
// formatted totals, so exports always match the dashboard KPI cards.
import { DISP_KNOWN_ORDER } from "../constants.ts";

import type { Barrier } from "../types.ts";

import { computeKpi } from "../utils.ts";

export interface KpiStats {
  total: string;
  compliant: string;
  nonCompliant: string;
  pct: string;
  critical: string;
}

// Derives pt-BR formatted KPI totals from one computeKpi pass; empty input
// yields zeros and 0% (no div-by-zero/NaN). Matches dashboard KPI exactly,
// including fail-closed novel values.
export function kpiStats(barriers: Barrier[]): KpiStats {
  const k = computeKpi(barriers);
  const n = (v: number) => v.toLocaleString("pt-BR");
  return {
    total: n(k.total),
    compliant: n(k.compliant),
    nonCompliant: n(k.nonCompliant),
    pct: `${k.pctCompliant}%`,
    critical: n(k.criticalNonCompliant),
  };
}

// Builds the [label, value] summary table from one computeKpi pass.
// Availability rows come from the dynamic bucket (known first in canonical
// order, novel values after by volume), so a new status can never go missing
// while the total still reconciles.
export function summaryRows(barriers: Barrier[]): Array<[string, string]> {
  const k = computeKpi(barriers);
  const n = (v: number) => v.toLocaleString("pt-BR");
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
