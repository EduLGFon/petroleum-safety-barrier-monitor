/**
 * ══════════════════════════════════════════════════════════════════════════
 * UTILS — barrel over dashboard derivations and shared formatters
 * ══════════════════════════════════════════════════════════════════════════
 * Importers keep importing from here; implementations live in small modules
 * (dashboard derivations, pt-BR formatters) instead of one large file.
 */
export {
  defaultFilters,
  sanitizeFilterPatch,
  sanitizeFilters,
} from "./dashboard/filters.ts";
export { applyFilters, applySorting, paginate } from "./dashboard/filters.ts";
export { daysSince, fmt, fmtDate, humanDuration, pct } from "./format.ts";
export { computeChartData } from "./dashboard/chart.ts";
export { computeKpi } from "./dashboard/kpi.ts";
