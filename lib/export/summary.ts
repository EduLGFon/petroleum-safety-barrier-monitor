// Export summary - KPI strip stats and summary table from one computeKpi pass.
// This is why it exists: spreadsheet and print report share the same
// formatted totals, so exports always match the dashboard KPI cards.
import { DISP_KNOWN_ORDER } from "../constants.ts";
import { computeKpi } from "../utils.ts";
import type { Barrier } from "../types.ts";

export interface KpiStats {
  total: string;
  conformes: string;
  naoConformes: string;
  pct: string;
  criticas: string;
}

// Derives pt-BR formatted KPI totals from one computeKpi pass; empty input
// yields zeros and 0% (no div-by-zero/NaN). Matches dashboard KPI exactly,
// including fail-closed novel values.
export function kpiStats(barriers: Barrier[]): KpiStats {
  const k = computeKpi(barriers);
  const n = (v: number) => v.toLocaleString("pt-BR");
  return {
    total: n(k.total),
    conformes: n(k.conforme),
    naoConformes: n(k.naoConforme),
    pct: `${k.pctConforme}%`,
    criticas: n(k.criticasNC),
  };
}

// Builds the [label, value] summary table from one computeKpi pass.
// Disponibilidade rows come from the dynamic bucket (known first in canonical
// order, novel values after by volume), so a new status can never go missing
// while the total still reconciles.
export function summaryRows(barriers: Barrier[]): Array<[string, string]> {
  const k = computeKpi(barriers);
  const n = (v: number) => v.toLocaleString("pt-BR");
  const byDisp = k.byDisponibilidade ?? {};
  const keys = Object.keys(byDisp).sort((a, b) => {
    const ia = DISP_KNOWN_ORDER.indexOf(a), ib = DISP_KNOWN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return byDisp[b] - byDisp[a];
  });
  return [
    ["Total", n(k.total)],
    ...keys.map((key): [string, string] => [key, n(byDisp[key] ?? 0)]),
    ["Conformes", n(k.conforme)],
    ["Não Conformes", n(k.naoConforme)],
    ["Críticas NC", n(k.criticasNC)],
    ["% Conformidade", `${k.pctConforme}%`],
  ];
}
