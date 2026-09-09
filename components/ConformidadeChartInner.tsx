// Conformidade chart inner - stacked horizontal bars as pure SVG.
// This is why it exists: dependency-free replacement for recharts with
// the same data contract (Conforme vs Nao Conforme per category), axis,
// gridlines and hover tooltip. All SVG text styling goes through `style`
// (never textAnchor/fontSize props) so hydration keeps it intact.
// Bars morph via CSS transitions on geometry attributes (staggered per
// row) when the station changes; rows play a staggered entrance on mount.
import {
  buildTicks,
  chartHeight,
  chartWidth,
  computeMax,
  GEO,
  makeW,
  px,
  TOP,
} from "./chart/geometry.ts";
import { useSettings } from "../context/SettingsContext.tsx";
import type { CategoryConformidade } from "../lib/types.ts";
import { ChartTooltip } from "./chart/ChartTooltip.tsx";
import { useEffect, useState } from "preact/hooks";
import { ChartRow } from "./chart/ChartRow.tsx";
import type { CSSProperties } from "preact";

interface Props {
  data: CategoryConformidade[];
}

// ConformidadeChartInner: stacked Conforme / Não Conforme SVG bars with hover tip and density geometry.
export default function ConformidadeChartInner({ data }: Props) {
  const [hover, setHover] = useState<
    { i: number; x: number; y: number } | null
  >(
    null,
  );
  const { settings } = useSettings();
  const { ROW_H, BAR_H, LABEL_W } = GEO[settings.density] ?? GEO.comfortable;
  // Dismiss the floating tip when anything scrolls (page or the chart's own
  // scroll container) or the viewport resizes: the stored clientX/clientY
  // anchor would otherwise go stale and the tip would float detached from
  // the cursor/row until the next mousemove.
  useEffect(() => {
    const hide = () => setHover(null);
    globalThis.addEventListener("scroll", hide, true);
    globalThis.addEventListener("resize", hide);
    return () => {
      globalThis.removeEventListener("scroll", hide, true);
      globalThis.removeEventListener("resize", hide);
    };
  }, []);
  const max = computeMax(data);
  const height = chartHeight(data.length, ROW_H);
  const width = chartWidth(LABEL_W);
  const ticks = buildTicks(max);
  // w: linear value→pixels scale against the max row total.
  const w = makeW(max);
  const hovered = hover !== null ? data[hover.i] : null;
  // Geometry lives in attributes (SSR/fallback) AND in style: only the
  // CSS values go through the transition engine, which is what morphs
  // the bars when the station changes.

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Conformidade por categoria"
      >
        {
          /* gridlines + x ticks (keyed by index so the axis glides
            to its new scale instead of remounting on data change) */
        }
        {ticks.map((t, ti) => (
          <g key={ti}>
            <line
              x1={LABEL_W + w(t)}
              y1={TOP - 2}
              x2={LABEL_W + w(t)}
              y2={TOP + data.length * ROW_H}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.6}
              style={{
                x1: px(LABEL_W + w(t)),
                x2: px(LABEL_W + w(t)),
                transition: "x1 .5s var(--ease-out), x2 .5s var(--ease-out)",
              } as CSSProperties}
            />
            <text
              x={LABEL_W + w(t)}
              y={TOP + data.length * ROW_H + 18}
              style={{
                textAnchor: "middle",
                fontSize: "var(--d-small)",
                fill: "var(--text-muted)",
                x: px(LABEL_W + w(t)),
                transition: "x .5s var(--ease-out)",
              } as CSSProperties}
            >
              {t.toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <ChartRow
            key={d.name}
            d={d}
            index={i}
            y={TOP + i * ROW_H}
            dimmed={hover !== null && hover.i !== i}
            labelW={LABEL_W}
            barH={BAR_H}
            rowH={ROW_H}
            w={w}
            onHover={(ii, x, y) => setHover({ i: ii, x, y })}
            onLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hovered && hover && (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          title={hovered.name}
          conforme={hovered.Conforme}
          naoConforme={hovered["Não Conforme"]}
        />
      )}
      <div
        style={{
          display: "flex",
          gap: "var(--d-gap-lg)",
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          paddingTop: "var(--d-bar-gap)",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#22c55e",
              marginRight: 6,
            }}
          />
          Conforme
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#ef4444",
              marginRight: 6,
            }}
          />
          Não Conforme
        </span>
      </div>
    </div>
  );
}
