// chart geometry - shared sizes and pure scale helpers for the compliance SVG.
// Why it exists: single source of truth for density heights, the plot layout
// that fills its column and tooltip offsets, so rows, tooltip and frame stay
// in sync without duplication.
import type { CategoryCompliance } from "../../lib/types.ts";

export const COUNT_W = 56;
export const TOP = 6;
export const AXIS_H = 26;
export const TEXT_DY = 14;
export const AXIS_TEXT_DY = 18;

/* Floating tooltip geometry - offset from the cursor, margin from edges. */
export const TIP_OFFSET = 14;
export const TIP_MARGIN = 8;
// Above app overlays (barrier modal 991, settings 1000/1001) so the tip is
// never painted underneath them, below the loading splash (9999).
export const TIP_Z = 2000;

/* Bar geometry per density - compact rows leave room for larger type;
 * roomier on spacious. Label column keeps its width since type got bigger. */
export const GEO = {
  compact: { ROW_H: 18, BAR_H: 12, LABEL_W: 180 },
  comfortable: { ROW_H: 22, BAR_H: 15, LABEL_W: 200 },
  spacious: { ROW_H: 26, BAR_H: 18, LABEL_W: 220 },
} as const;

// DensityKey: valid density names matching the GEO keys.
export type DensityKey = keyof typeof GEO;

export interface ChartGeometry {
  ROW_H: number;
  BAR_H: number;
  LABEL_W: number;
  COUNT_W: number;
  AXIS_H: number;
  TEXT_DY: number;
  AXIS_TEXT_DY: number;
  LABEL_CHARS: number;
}

// chartGeometry: density geometry scaled by the user font-size preset.
// Row and bar heights follow the font scale. The label column grows more
// slowly (capped at 1.15x) so the plot keeps usable width, and the label
// character budget shrinks when the font outgrows the column.
export function chartGeometry(
  density: DensityKey,
  scale: number,
): ChartGeometry {
  const g = GEO[density] ?? GEO.comfortable;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const labelW = Math.round(g.LABEL_W * Math.min(s, 1.15));
  const widthRatio = labelW / g.LABEL_W;
  return {
    ROW_H: Math.round(g.ROW_H * s),
    BAR_H: Math.round(g.BAR_H * s),
    LABEL_W: labelW,
    COUNT_W: Math.max(COUNT_W, Math.round(COUNT_W * s)),
    AXIS_H: Math.round(AXIS_H * s),
    TEXT_DY: Math.round(TEXT_DY * s),
    AXIS_TEXT_DY: Math.round(AXIS_TEXT_DY * s),
    LABEL_CHARS: Math.max(8, Math.floor(26 * widthRatio / s)),
  };
}

// Narrowest plot a bar row is drawn on, in SVG user units. Below it the
// viewBox stays wider than the column, so the browser scales the whole SVG
// down (the one case that still letterboxes) instead of crushing the bars.
// Sized so a real dashboard column (>= ~500 px) always fits in every density.
export const MIN_PLOT_W = 260;

export interface ChartLayout {
  // Usable width of the bars, in SVG user units.
  plotW: number;
  // viewBox width: label column + plot + count column. Equal to the measured
  // column width whenever the column is at least MIN_PLOT_W wide, which is
  // what keeps the drawing unscaled (and free of dead space) in every
  // density and at every monitor size.
  width: number;
}

// layoutChart: fits the chart to the width its column actually offers. The
// plot absorbs the slack, so the SVG scales 1:1 with the column instead of
// being centred inside it (side margins) or shrunk to fit (vertical
// letterboxing) - the two dead-space shapes a fixed viewBox produced.
export function layoutChart(
  available: number,
  labelW: number,
  countW = COUNT_W,
): ChartLayout {
  const plotW = Math.max(MIN_PLOT_W, available - labelW - countW);
  return { plotW, width: labelW + plotW + countW };
}

// rowTotal: combined Conforme + Não Conforme count for one category.
export function rowTotal(d: CategoryCompliance): number {
  return d.Conforme + d["Não Conforme"];
}

// computeMax: largest row total, floored at 1 to avoid divide-by-zero.
export function computeMax(data: CategoryCompliance[]): number {
  return Math.max(1, ...data.map(rowTotal));
}

// buildTicks: axis stops at 0, midpoint and max for the gliding scale.
// Deduped so tiny datasets (max 1) render [0, 1], not [0, 1, 1].
export function buildTicks(max: number): number[] {
  return [...new Set([0, Math.round(max / 2), max])];
}

// scaleW: linear value→pixels scale against the max row total.
export function scaleW(v: number, max: number, plotW: number): number {
  return Math.max(0, (v / max) * plotW);
}

// makeW: binds max and plot width into a single-arg scaler for row rendering.
export function makeW(max: number, plotW: number): (v: number) => number {
  return (v: number) => scaleW(v, max, plotW);
}

// px: number→CSS pixel string for transitioned SVG geometry.
export function px(n: number): string {
  return `${n}px`;
}

// chartHeight: total SVG height for rowCount rows at the given row height.
export function chartHeight(
  rowCount: number,
  rowH: number,
  axisH = AXIS_H,
): number {
  return TOP + rowCount * rowH + axisH;
}
