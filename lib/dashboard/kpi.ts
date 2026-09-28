// Dashboard KPI - single-pass aggregation over Barrier[].
// This is why it exists: every KPI surface (cards, band, exports) shares one
// counting policy, so fixed fields, dynamic buckets, and totals reconcile.
import { isCriticalRankLabel } from "../enums/codes.ts";

import type { Barrier, KpiSnapshot } from "../types.ts";

// Aggregates KPI totals in one O(N) pass; empty input yields zeros, 0% and empty buckets.
export function computeKpi(b: Barrier[]): KpiSnapshot {
  const t = b.length;
  // Single pass - counts every value actually present (dynamic buckets)
  // alongside the well-known fast-path fields, so future statuses are
  // included in totals instead of silently dropped.
  const byAvailability: Record<string, number> = {};
  const byCompliance: Record<string, number> = {};
  const byCriticality: Record<string, number> = {};
  let available = 0,
    outOfService = 0,
    contingencyOutage = 0,
    degradedContingency = 0,
    degraded = 0,
    unavailable = 0,
    other = 0,
    compliant = 0,
    nonCompliant = 0,
    criticalNonCompliant = 0,
    withoutActionPlan = 0;
  // Non-compliant count per criticality rank (dynamic keys like
  // byCriticality) so the KPI cards can show ESO/A splits without the rows.
  const ncByCriticality: Record<string, number> = {};
  for (const x of b) {
    byAvailability[x.availability] = (byAvailability[x.availability] ?? 0) + 1;
    byCompliance[x.compliance] = (byCompliance[x.compliance] ?? 0) + 1;
    byCriticality[x.criticality] = (byCriticality[x.criticality] ?? 0) + 1;
    switch (x.availability) {
      case "Disponível":
        available++;
        break;
      case "Fora de Operação":
        outOfService++;
        break;
      case "Indisponível Contingenciado":
        contingencyOutage++;
        break;
      case "Degradado Contingenciado":
        degradedContingency++;
        break;
      case "Degradado":
        degraded++;
        break;
      case "Indisponível":
        unavailable++;
        break;
      default:
        // Novel status: counted in other so fixed fields + other === total.
        other++;
        break;
    }
    if (x.compliance === "Conforme") compliant++;
    else {
      // Fail-closed: any novel compliance counts as "Não Conforme", so the
      // fixed fields always reconcile (compliant + nonCompliant === total) and
      // match computeChartData, which already buckets non-Conforme as NC.
      nonCompliant++;
      ncByCriticality[x.criticality] = (ncByCriticality[x.criticality] ?? 0) +
        1;
      if (isCriticalRankLabel(x.criticality)) criticalNonCompliant++;
    }
    if (x.actionPlan.trim() === "") withoutActionPlan++;
  }
  return {
    total: t,
    available,
    outOfService,
    contingencyOutage,
    degradedContingency,
    degraded,
    unavailable,
    other,
    compliant,
    nonCompliant,
    criticalNonCompliant,
    withoutActionPlan,
    // One decimal (81.3, not 81) so the card matches summarizeCompliance and
    // small scopes stop rounding to identical integers.
    pctCompliant: t > 0 ? Math.round(compliant / t * 1000) / 10 : 0,
    byAvailability,
    byCompliance,
    byCriticality,
    ncByCriticality,
  };
}
