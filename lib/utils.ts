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
  SortableColumn,
} from "./types.ts";
import { PAGE_SIZE_OPTS, SIM_DATE } from "./constants.ts";

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

// Groups Conforme/ Não Conforme per category in one pass; truncates names >26 chars, sorts biggest-first.
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

// Applies case-insensitive query (tag/loc/instalação/categoria) plus exact filters; empty strings mean no filter.
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

// Sorts a copy (no mutation); id numeric, others pt-BR localeCompare; no sortCol returns input as-is.
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

// Slices 1-based page window; out-of-range pages return empty, never throws.
export function paginate<T>(a: T[], p: number, s: number): T[] {
  return a.slice((p - 1) * s, p * s);
}

// Days from ISO date to SIM_DATE, floored and clamped at 0 so future dates never go negative.
export function daysSince(d: string): number {
  return Math.max(
    0,
    Math.floor((SIM_DATE.getTime() - new Date(d).getTime()) / 86_400_000),
  );
}

// Formats day count as pt-BR duration (dia/semana/mês/ano); days < 2 collapses to "1 dia".
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

// Converts YYYY-MM-DD to DD/MM/YYYY; assumes valid ISO input, no validation.
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// Formats number with pt-BR thousands separator.
export function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}
// Appends % suffix; expects an already-rounded 0-100 value.
export function pct(n: number): string {
  return `${n}%`;
}
// Returns a fresh default FilterState (page 1, 25 rows, sort by id asc); new object each call.
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

// Sort columns the UI and SQL whitelist both accept; anything else falls back to id.
const SORT_COLS: SortableColumn[] = [
  "id",
  "tag",
  "criticidade",
  "categoria",
  "disponibilidade",
  "conformidade",
  "statusSince",
];

// Validates one persisted filter patch, keeping only well-formed keys.
// Unknown or malformed values are dropped so corrupt localStorage or settings
// defaults can never wedge the dashboard into an empty state.
export function sanitizeFilterPatch(raw: unknown): Partial<FilterState> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const patch: Partial<FilterState> = {};
  const text = (v: unknown) =>
    typeof v === "string" ? v.trim().slice(0, 200) : undefined;
  const query = text(r.query);
  if (query !== undefined) patch.query = query;
  const disp = text(r.disponibilidade);
  if (disp !== undefined) patch.disponibilidade = disp;
  const conf = text(r.conformidade);
  if (conf !== undefined) patch.conformidade = conf;
  const cat = text(r.categoria);
  if (cat !== undefined) patch.categoria = cat;
  if (Number.isInteger(r.page) && (r.page as number) > 0) {
    patch.page = Math.min(r.page as number, 100000);
  }
  if (
    Number.isInteger(r.pageSize) &&
    (PAGE_SIZE_OPTS as readonly number[]).includes(r.pageSize as number)
  ) {
    patch.pageSize = r.pageSize as FilterState["pageSize"];
  }
  if (
    typeof r.sortCol === "string" &&
    SORT_COLS.includes(r.sortCol as SortableColumn)
  ) {
    patch.sortCol = r.sortCol as SortableColumn;
  }
  if (r.sortDir === "asc" || r.sortDir === "desc") patch.sortDir = r.sortDir;
  return patch;
}

// Merges an untrusted persisted blob over fresh defaults; always complete.
export function sanitizeFilters(raw: unknown): FilterState {
  return { ...defaultFilters(), ...sanitizeFilterPatch(raw) };
}
