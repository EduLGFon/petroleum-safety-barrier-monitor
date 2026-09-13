// Dashboard chart data - per-category Conforme/NC buckets for the chart.
// This is why it exists: categories come from the data (never a seed list),
// so new ones appear automatically in the SVG with no code change.
import type { Barrier, CategoryConformidade } from "../types.ts";

// Groups Conforme / Não Conforme per category in one pass; truncates names >26 chars, sorts biggest-first.
// Não Conforme means !== "Conforme" (fail-closed, same policy as computeKpi) so chart and KPI never diverge.
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
