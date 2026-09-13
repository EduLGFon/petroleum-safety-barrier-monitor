// chart geometry - shared sizes and pure scale helpers for the conformidade SVG.
// Why it exists: single source of truth for density heights, plot width and
// tooltip offsets so rows, tooltip and frame stay in sync without duplication.
import type { CategoryConformidade } from "../../lib/types.ts";

export const COUNT_W = 56;
export const TOP = 6;
export const AXIS_H = 26;
export const PLOT_W = 440;

/* Floating tooltip geometry — offset from the cursor, margin from edges. */
export const TIP_OFFSET = 14;
export const TIP_MARGIN = 8;
// Above app overlays (barrier modal 991, settings 1000/1001) so the tip is
// never painted underneath them, below the loading splash (9999).
export const TIP_Z = 2000;

/* Bar geometry per density — tighter rows on compact, roomier on spacious. */
export const GEO = {
  compact: { ROW_H: 21, BAR_H: 14, LABEL_W: 180 },
  comfortable: { ROW_H: 26, BAR_H: 18, LABEL_W: 200 },
  spacious: { ROW_H: 31, BAR_H: 22, LABEL_W: 220 },
} as const;

// DensityKey: valid density names matching the GEO keys.
export type DensityKey = keyof typeof GEO;

// rowTotal: combined Conforme + Nao Conforme count for one category.
export function rowTotal(d: CategoryConformidade): number {
  return d.Conforme + d["Não Conforme"];
}

// computeMax: largest row total, floored at 1 to avoid divide-by-zero.
export function computeMax(data: CategoryConformidade[]): number {
  return Math.max(1, ...data.map(rowTotal));
}

// buildTicks: axis stops at 0, midpoint and max for the gliding scale.
// Deduped so tiny datasets (max 1) render [0, 1], not [0, 1, 1].
export function buildTicks(max: number): number[] {
  return [...new Set([0, Math.round(max / 2), max])];
}

// scaleW: linear value→pixels scale against the max row total.
export function scaleW(v: number, max: number): number {
  return Math.max(0, (v / max) * PLOT_W);
}

// makeW: binds max into a single-arg scaler for row rendering.
export function makeW(max: number): (v: number) => number {
  return (v: number) => scaleW(v, max);
}

// px: number→CSS pixel string for transitioned SVG geometry.
export function px(n: number): string {
  return `${n}px`;
}

// chartHeight: total SVG height for rowCount rows at the given row height.
export function chartHeight(rowCount: number, rowH: number): number {
  return TOP + rowCount * rowH + AXIS_H;
}

// chartWidth: total SVG width for the given label column width.
export function chartWidth(labelW: number): number {
  return labelW + PLOT_W + COUNT_W;
}
