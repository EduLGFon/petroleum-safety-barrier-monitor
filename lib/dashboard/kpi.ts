// Dashboard KPI - single-pass aggregation over Barrier[].
// This is why it exists: every KPI surface (cards, band, exports) shares one
// counting policy, so fixed fields, dynamic buckets, and totals reconcile.
import type { Barrier, KpiSnapshot } from "../types.ts";

// Aggregates KPI totals in one O(N) pass; empty input yields zeros, 0% and empty buckets.
export function computeKpi(b: Barrier[]): KpiSnapshot {
  const t = b.length;
  // Single pass - counts every value actually present (dynamic buckets)
  // alongside the well-known fast-path fields, so future statuses are
  // included in totals instead of silently dropped.
  const byDisponibilidade: Record<string, number> = {};
  const byConformidade: Record<string, number> = {};
  const byCriticidade: Record<string, number> = {};
  let disponivel = 0,
    foraDeOp = 0,
    indispCont = 0,
    degrCont = 0,
    degradado = 0,
    indisponivel = 0,
    conforme = 0,
    naoConforme = 0,
    criticasNC = 0;
  for (const x of b) {
    byDisponibilidade[x.disponibilidade] =
      (byDisponibilidade[x.disponibilidade] ?? 0) + 1;
    byConformidade[x.conformidade] = (byConformidade[x.conformidade] ?? 0) + 1;
    byCriticidade[x.criticidade] = (byCriticidade[x.criticidade] ?? 0) + 1;
    switch (x.disponibilidade) {
      case "Disponível":
        disponivel++;
        break;
      case "Fora de Operação":
        foraDeOp++;
        break;
      case "Indisponível Contingenciado":
        indispCont++;
        break;
      case "Degradado Contingenciado":
        degrCont++;
        break;
      case "Degradado":
        degradado++;
        break;
      case "Indisponível":
        indisponivel++;
        break;
    }
    if (x.conformidade === "Conforme") conforme++;
    else {
      // Fail-closed: any novel conformidade counts as Não Conforme, so the
      // fixed fields always reconcile (conforme + naoConforme === total) and
      // match computeChartData, which already buckets non-Conforme as NC.
      naoConforme++;
      if (x.criticidade === "Crítica") criticasNC++;
    }
  }
  return {
    total: t,
    disponivel,
    foraDeOp,
    indispCont,
    degrCont,
    degradado,
    indisponivel,
    conforme,
    naoConforme,
    criticasNC,
    pctConforme: t > 0 ? Math.round(conforme / t * 100) : 0,
    byDisponibilidade,
    byConformidade,
    byCriticidade,
  };
}
