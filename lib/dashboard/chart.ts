// Dashboard chart data - per-category Conforme/NC buckets for the chart.
// This is why it exists: categories come from the data (never a seed list),
// so new ones appear automatically in the SVG with no code change.
import type { Barrier, CategoryCompliance } from "../types.ts";

// Groups Conforme / Não Conforme per category in one pass; sorts biggest-first.
// Não Conforme means !== "Conforme" (fail-closed, same policy as computeKpi) so chart and KPI never diverge.
// Names stay FULL here: the 26-char truncation is presentation-only
// (truncateLabel, applied by ChartRow) so a chart row can filter the table
// by its exact category (applyFilters matches category exactly).
export function computeChartData(b: Barrier[]): CategoryCompliance[] {
  // Categories come from the data, not the CATEGORIES seed list: new
  // categories appear automatically, removed ones vanish. Sorted by volume
  // (biggest first) so the first screenful stays meaningful at 70+ rows.
  // Single O(N) pass into per-category buckets.
  const buckets = new Map<string, { c: number; nc: number }>();
  for (const x of b) {
    let e = buckets.get(x.category);
    if (!e) buckets.set(x.category, e = { c: 0, nc: 0 });
    if (x.compliance === "Conforme") e.c++;
    else e.nc++;
  }
  return [...buckets.entries()]
    .sort((a, z) => (z[1].c + z[1].nc) - (a[1].c + a[1].nc))
    .map(([name, v]) => ({
      name,
      Conforme: v.c,
      "Não Conforme": v.nc,
    }));
}

// truncateLabel: presentation-only shortening for SVG row labels; the full
// name stays in data (tooltip <title>, search, table filter).
export function truncateLabel(name: string, max = 26): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ChartSort: volume = biggest total first; ncRate = highest % Não Conforme
// first (rows below minVolume sink, so a 1-item 100%-NC row never tops a
// 200-item 40%-NC one); alpha = A-Z (pt-BR).
export type ChartSort = "volume" | "ncRate" | "alpha";

// ChartView: card tabs. bars = multi-column stacked rows; summary = donut
// + Top NC.
export type ChartView = "bars" | "summary";

// Default Top-N for the collapsed chart card: 20 rows over 2 side-by-side
// columns (10 each) fits the card with no internal scroll at any density.
export const CHART_TOP_N = 20;
// Columns in the bars view; collapses to 1 on narrow screens via CSS.
export const CHART_COLUMNS = 2;
// Minimum row volume to compete in ncRate sort; smaller rows sink below.
export const CHART_MIN_VOLUME = 5;
// Rows in the summary view's Top Não Conforme list.
export const CHART_TOP_NC = 8;

export interface ComplianceSummary {
  compliant: number;
  nonCompliant: number;
  total: number;
  // 0-100, one decimal.
  pctCompliant: number;
  // Top CHART_TOP_NC rows with NC > 0, most NC first.
  topNC: CategoryCompliance[];
}

// summarizeCompliance: executive totals + worst-offender list for the
// summary view. Pure; the donut and list render it verbatim.
export function summarizeCompliance(
  data: CategoryCompliance[],
  limit = CHART_TOP_NC,
): ComplianceSummary {
  let compliant = 0;
  let nonCompliant = 0;
  for (const d of data) {
    compliant += d.Conforme;
    nonCompliant += d["Não Conforme"];
  }
  const total = compliant + nonCompliant;
  const topNC = data
    .filter((d) => d["Não Conforme"] > 0)
    .sort((a, b) =>
      b["Não Conforme"] - a["Não Conforme"] ||
      (b.Conforme + b["Não Conforme"]) - (a.Conforme + a["Não Conforme"]) ||
      a.name.localeCompare(b.name, "pt-BR")
    )
    .slice(0, Math.max(0, limit));
  return {
    compliant,
    nonCompliant,
    total,
    pctCompliant: total === 0
      ? 100
      : Math.round((compliant / total) * 1000) / 10,
    topNC,
  };
}

export interface PreparedChart {
  rows: CategoryCompliance[];
  // Pre-limit row count (after query filter), for "Ver todas (N)".
  total: number;
  // Rows folded into Outras (0 when expanded or under the limit).
  hidden: number;
  // Item total folded into Outras.
  hiddenTotal: number;
}

// prepareChart: filter → sort → Top-N with an aggregated Outras tail.
// Pure and UI-agnostic: the card decides limit/expanded, the SVG renders
// rows verbatim (the Outras row is the last one iff hidden > 0).
export function prepareChart(
  data: CategoryCompliance[],
  opts: {
    limit?: number;
    query?: string;
    sort?: ChartSort;
    minVolume?: number;
  } = {},
): PreparedChart {
  const {
    limit = CHART_TOP_N,
    query = "",
    sort = "volume",
    minVolume = CHART_MIN_VOLUME,
  } = opts;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? data.filter((d) => d.name.toLowerCase().includes(q))
    : [...data];
  const totalOf = (d: CategoryCompliance) => d.Conforme + d["Não Conforme"];
  const ncRateOf = (d: CategoryCompliance) => {
    const t = totalOf(d);
    return t === 0 ? 0 : d["Não Conforme"] / t;
  };
  const sorted = filtered.sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name, "pt-BR");
    if (sort === "ncRate") {
      const aSmall = totalOf(a) < minVolume ? 1 : 0;
      const bSmall = totalOf(b) < minVolume ? 1 : 0;
      if (aSmall !== bSmall) return aSmall - bSmall;
      return ncRateOf(b) - ncRateOf(a) ||
        totalOf(b) - totalOf(a) ||
        a.name.localeCompare(b.name, "pt-BR");
    }
    return totalOf(b) - totalOf(a) ||
      a.name.localeCompare(b.name, "pt-BR");
  });
  // limit <= 0 (or >= rows) means expanded: no Outras bucket.
  if (limit <= 0 || sorted.length <= limit) {
    return { rows: sorted, total: sorted.length, hidden: 0, hiddenTotal: 0 };
  }
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  let c = 0;
  let nc = 0;
  for (const d of tail) {
    c += d.Conforme;
    nc += d["Não Conforme"];
  }
  return {
    rows: [
      ...head,
      { name: `Outras (${tail.length})`, Conforme: c, "Não Conforme": nc },
    ],
    total: sorted.length,
    hidden: tail.length,
    hiddenTotal: c + nc,
  };
}

// splitColumns: chunks rows into `cols` balanced columns (first columns take
// the extra row on odd splits), preserving order. The bars view renders one
// SVG per column side by side so twice the categories fit without scrolling.
export function splitColumns<T>(rows: T[], cols = CHART_COLUMNS): T[][] {
  if (rows.length === 0) return [];
  if (cols <= 1) return [rows];
  const per = Math.ceil(rows.length / cols);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) {
    out.push(rows.slice(i, i + per));
  }
  return out;
}
