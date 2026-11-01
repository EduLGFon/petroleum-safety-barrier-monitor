// Unit tests for components/chart/geometry.ts - plot layout and scale math.
// The layout cases are the dead-space regression: the viewBox width must equal
// the column width at every density, otherwise the browser scales the SVG and
// leaves a gap above and below the plot (or margins at its sides).
import {
  buildTicks,
  chartGeometry,
  chartHeight,
  COUNT_W,
  GEO,
  layoutChart,
  MIN_PLOT_W,
  scaleW,
} from "./geometry.ts";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("buildTicks dedupes tiny maxima", () => {
  assertEquals(buildTicks(1), [0, 1]);
  assertEquals(buildTicks(0), [0]);
  assertEquals(buildTicks(100), [0, 50, 100]);
});

Deno.test("scaleW clamps negatives and scales linearly", () => {
  assertStrictEquals(scaleW(0, 10, 400), 0);
  assertStrictEquals(scaleW(-5, 10, 400), 0);
  assert(scaleW(5, 10, 400) > 0 && scaleW(5, 10, 400) < scaleW(10, 10, 400));
  assertStrictEquals(scaleW(10, 10, 400), 400);
});

Deno.test("layoutChart makes the drawing exactly as wide as the column", () => {
  for (const [density, geo] of Object.entries(GEO)) {
    // 609 px was the real spacious column inside the old 1400 px shell: it was
    // narrower than the fixed 656 px viewBox, which is what scaled the chart
    // down and opened the gap. Every density must now fill the column.
    const tight = layoutChart(609, geo.LABEL_W);
    assertStrictEquals(tight.width, 609, density);
    // And a wide monitor column stretches instead of being centred.
    const wide = layoutChart(2400, geo.LABEL_W);
    assertStrictEquals(wide.width, 2400, density);
    assert(wide.plotW > tight.plotW, density);
    // Label + count columns keep their size, the plot takes the rest.
    assertStrictEquals(
      wide.plotW,
      2400 - geo.LABEL_W - COUNT_W,
      density,
    );
  }
});

Deno.test("layoutChart splits the column into label, plot and count", () => {
  const { plotW, width } = layoutChart(1200, 200);
  assertStrictEquals(plotW, 1200 - 200 - COUNT_W);
  assertStrictEquals(width, 1200);
});

Deno.test("layoutChart never crushes the plot below the minimum", () => {
  // Phone-sized column: the viewBox stays wider than the column, so the
  // browser scales the SVG down (graceful) instead of drawing 20 px bars.
  const { plotW, width } = layoutChart(330, GEO.compact.LABEL_W);
  assertStrictEquals(plotW, MIN_PLOT_W);
  assertStrictEquals(width, GEO.compact.LABEL_W + MIN_PLOT_W + COUNT_W);
  assert(width > 330);
});

Deno.test("chartGeometry keeps the current geometry at scale 1", () => {
  for (const [density, geo] of Object.entries(GEO)) {
    const g = chartGeometry(density as keyof typeof GEO, 1);
    assertStrictEquals(g.ROW_H, geo.ROW_H, density);
    assertStrictEquals(g.BAR_H, geo.BAR_H, density);
    assertStrictEquals(g.LABEL_W, geo.LABEL_W, density);
    assertStrictEquals(g.COUNT_W, COUNT_W, density);
    assertStrictEquals(g.LABEL_CHARS, 26, density);
  }
});

Deno.test("chartGeometry grows rows and shrinks the label budget at 125%", () => {
  const g = chartGeometry("comfortable", 1.25);
  assertStrictEquals(g.ROW_H, 28);
  assertStrictEquals(g.BAR_H, 19);
  assertStrictEquals(g.LABEL_W, 230);
  assertStrictEquals(g.COUNT_W, 70);
  assertStrictEquals(g.AXIS_H, 33);
  assertStrictEquals(g.TEXT_DY, 18);
  assertStrictEquals(g.AXIS_TEXT_DY, 23);
  assertStrictEquals(g.LABEL_CHARS, 23);
});

Deno.test("chartGeometry falls back to scale 1 for invalid scales", () => {
  const base = chartGeometry("comfortable", 1);
  for (const scale of [0, -1, NaN, Infinity]) {
    assertEquals(chartGeometry("comfortable", scale), base);
  }
});

Deno.test("layoutChart and chartHeight use the scaled columns", () => {
  const { plotW, width } = layoutChart(1200, 230, 70);
  assertStrictEquals(plotW, 1200 - 230 - 70);
  assertStrictEquals(width, 1200);
  assertStrictEquals(chartHeight(10, 28, 33), 6 + 280 + 33);
});
