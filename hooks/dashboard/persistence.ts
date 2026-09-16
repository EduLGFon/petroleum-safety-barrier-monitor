// persistence.ts - dashboard localStorage slice; split out so reducer/state stay pure and SSR-safe.
import type { FilterState } from "../../lib/types.ts";
import type { ChartSort } from "../../lib/dashboard/chart.ts";

export const STORE_KEY = "barrier-dashboard";

export interface Persisted {
  location: string;
  filters: FilterState;
  selectedIds: number[];
  openId: number | null;
}

// Loads persisted dashboard slice from `barrier-dashboard` key; SSR-safe, returns {} on miss/error.
export function loadDash(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

// Persists dashboard slice to `barrier-dashboard` key; no-op on storage failure, state stays in memory.
export function saveDash(d: Persisted) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    // Storage may be unavailable - dashboard still works in memory.
  }
}

// Chart card prefs live under their own key (not the dashboard slice) so
// the sort/expand choice persists without touching either data hook's save
// effect; SSR-safe, validated on load, corrupt values fall back.
export const CHART_KEY = "barrier-chart";

export interface ChartPrefs {
  sort: ChartSort;
  expanded: boolean;
}

const CHART_SORTS: ChartSort[] = ["volume", "ncRate", "alpha"];

// Loads chart prefs; SSR-safe, returns defaults on miss/error.
export function loadChartPrefs(): ChartPrefs {
  const fallback: ChartPrefs = { sort: "volume", expanded: false };
  if (typeof window === "undefined") return fallback;
  try {
    const s = localStorage.getItem(CHART_KEY);
    if (!s) return fallback;
    const p = JSON.parse(s) as Partial<ChartPrefs>;
    return {
      sort: CHART_SORTS.includes(p.sort as ChartSort)
        ? (p.sort as ChartSort)
        : fallback.sort,
      expanded: p.expanded === true,
    };
  } catch {
    return fallback;
  }
}

// Persists chart prefs; no-op on storage failure.
export function saveChartPrefs(p: ChartPrefs) {
  try {
    localStorage.setItem(CHART_KEY, JSON.stringify(p));
  } catch {
    // Storage may be unavailable - chart still works in memory.
  }
}
