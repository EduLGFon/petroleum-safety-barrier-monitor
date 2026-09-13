// ChartRow - per-category <g> row for the conformidade stacked bars.
// Why it exists: isolates row geometry and hover wiring from the SVG frame
// so the inner chart stays a thin shell over scales, axis and legend.
import type { CategoryConformidade } from "../../lib/types.ts";
import type { CSSProperties } from "preact";
import { PLOT_W, px } from "./geometry.ts";

interface Props {
  d: CategoryConformidade;
  index: number;
  y: number;
  dimmed: boolean;
  labelW: number;
  barH: number;
  rowH: number;
  w: (v: number) => number;
  onHover: (i: number, x: number, y: number) => void;
  onLeave: () => void;
}

// ChartRow: stacked Conforme / Nao Conforme segments plus count and hover target.
export function ChartRow(
  { d, index, y, dimmed, labelW, barH, rowH, w, onHover, onLeave }: Props,
) {
  const total = d.Conforme + d["Não Conforme"];
  // Staggered glide: each row trails the previous one on updates.
  const delay = `${Math.min(index * 45, 360)}ms`;
  const wC = Math.max(w(d.Conforme), d.Conforme > 0 ? 2 : 0);
  // wN: Não Conforme segment width; 2px minimum keeps small values visible.
  const wN = Math.max(
    w(d["Não Conforme"]),
    d["Não Conforme"] > 0 ? 2 : 0,
  );
  // barT: shared transition for both segments so they glide together.
  const barT =
    `width .55s var(--ease-out) ${delay}, x .55s var(--ease-out) ${delay}, opacity .3s var(--ease-std)`;
  return (
    <g
      className="animate-chart-row"
      onMouseMove={(e) => onHover(index, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      style={{
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity .22s var(--ease-std)",
        animationDelay: `${Math.min(index * 45, 360)}ms`,
      }}
    >
      <text
        x={labelW - 8}
        y={y + 14}
        style={{
          textAnchor: "end",
          fontSize: "var(--d-small)",
          fill: "var(--text-secondary)",
        }}
      >
        {d.name}
        <title>{d.name}</title>
      </text>
      <rect
        x={labelW}
        y={y}
        width={wC}
        height={barH}
        rx={d["Não Conforme"] === 0 ? 4 : 0}
        fill="#22c55e"
        style={{
          x: px(labelW),
          width: px(wC),
          transition: barT,
        } as CSSProperties}
      />
      <rect
        x={labelW + w(d.Conforme)}
        y={y}
        width={wN}
        height={barH}
        rx={4}
        fill="#ef4444"
        style={{
          x: px(labelW + w(d.Conforme)),
          width: px(wN),
          transition: barT,
        } as CSSProperties}
      />
      {/* hover target covering the full row width */}
      <rect
        x={labelW}
        y={y - 4}
        width={PLOT_W}
        height={rowH}
        fill="transparent"
      />
      {total > 0 && (
        <text
          key={total}
          className="animate-num"
          x={labelW + w(total) + 8}
          y={y + 14}
          style={{
            fontSize: "var(--d-small)",
            fill: "var(--text-muted)",
            x: px(labelW + w(total) + 8),
            transition: "x .55s var(--ease-out)",
          } as CSSProperties}
        >
          {total.toLocaleString("pt-BR")}
        </text>
      )}
    </g>
  );
}
