/**
 * ══════════════════════════════════════════════════════════════════════════
 * UTILS — pure dashboard derivations: KPIs, charts, filter/sort/paginate
 * ══════════════════════════════════════════════════════════════════════════
 * Stateless helpers over Barrier[] (computeKpi, computeChartData,
 * applyFilters, applySorting) plus date/number formatters. Used by
 * hooks/useDashboard.ts to derive every visible row, total, and label.
 */

import type {
  Barrier,
  CategoryConformidade,
  FilterState,
  KpiSnapshot,
} from "./types.ts";
import { SIM_DATE } from "./constants.ts";

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
    else if (x.conformidade === "Não Conforme") {
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

export function computeChartData(b: Barrier[]): CategoryConformidade[] {
  // Categories come from the data, not the CATEGORIES seed list: new
  // categories appear automatically, removed ones vanish. Sorted by volume
  // (biggest first) so the first screenful stays meaningful at 70+ rows.
  // Single O(N) pass into per-category buckets.
  const buckets = new Map<string, { c: number; nc: number }>();
  for (const x of b) {
    let e = buckets.get(x.categoria);
    if (!e) buckets.set(x.categoria, e = { c: 0, nc: 0 });
    if (x.conformidade === "Conforme") e.c++;
    else e.nc++;
  }
  return [...buckets.entries()]
    .sort((a, z) => (z[1].c + z[1].nc) - (a[1].c + a[1].nc))
    .map(([name, v]) => ({
      name: name.length > 26 ? name.slice(0, 26) + "…" : name,
      Conforme: v.c,
      "Não Conforme": v.nc,
    }));
}

export function applyFilters(b: Barrier[], f: FilterState): Barrier[] {
  let d = b;
  if (f.query) {
    const q = f.query.toLowerCase();
    d = d.filter((x) =>
      x.tag.toLowerCase().includes(q) || x.locDesc.toLowerCase().includes(q) ||
      x.instalacao.toLowerCase().includes(q) ||
      x.categoria.toLowerCase().includes(q)
    );
  }
  if (f.disponibilidade) {
    d = d.filter((x) => x.disponibilidade === f.disponibilidade);
  }
  if (f.conformidade) d = d.filter((x) => x.conformidade === f.conformidade);
  if (f.categoria) d = d.filter((x) => x.categoria === f.categoria);
  return d;
}

export function applySorting(b: Barrier[], f: FilterState): Barrier[] {
  if (!f.sortCol) return b;
  return [...b].sort((a, x) => {
    const av = String(a[f.sortCol as keyof Barrier] ?? "").toLowerCase();
    const bv = String(x[f.sortCol as keyof Barrier] ?? "").toLowerCase();
    // ISO dates sort lexicographically correctly
    const c = f.sortCol === "id"
      ? (a.id - x.id)
      : av.localeCompare(bv, "pt-BR", { numeric: true });
    return f.sortDir === "asc" ? c : -c;
  });
}

export function paginate<T>(a: T[], p: number, s: number): T[] {
  return a.slice((p - 1) * s, p * s);
}

export function daysSince(d: string): number {
  return Math.max(
    0,
    Math.floor((SIM_DATE.getTime() - new Date(d).getTime()) / 86_400_000),
  );
}

export function humanDuration(days: number): string {
  if (days < 2) return "1 dia";
  if (days < 7) return `${days} dias`;
  if (days < 14) return "1 semana";
  if (days < 30) return `${Math.floor(days / 7)} semanas`;
  if (days < 60) return "1 mês";
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  const y = Math.floor(days / 365);
  return `${y} ano${y > 1 ? "s" : ""}`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}
export function pct(n: number): string {
  return `${n}%`;
}
export function defaultFilters(): FilterState {
  return {
    query: "",
    disponibilidade: "",
    conformidade: "",
    categoria: "",
    page: 1,
    pageSize: 25,
    sortCol: "id",
    sortDir: "asc",
  };
}
