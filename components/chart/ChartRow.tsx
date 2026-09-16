// ChartRow - per-category <g> row for the compliance stacked bars.
// Why it exists: isolates row geometry and hover wiring from the SVG frame
// so the inner chart stays a thin shell over scales, axis and legend.
import type { CategoryCompliance } from "../../lib/types.ts";
import { truncateLabel } from "../../lib/dashboard/chart.ts";
import type { CSSProperties } from "preact";
import { PLOT_W, px } from "./geometry.ts";

interface Props {
  d: CategoryCompliance;
  index: number;
  y: number;
  dimmed: boolean;
  labelW: number;
  barH: number;
  rowH: number;
  w: (v: number) => number;
  onHover: (i: number, x: number, y: number) => void;
  onLeave: () => void;
  // Click-through: selects the category in the table filter (full name).
  // Absent = display-only row.
  onSelect?: (name: string) => void;
  // Active filter state: the selected row stays lit while others dim.
  active?: boolean;
  // Aggregated Outras tail row: muted fills, expands instead of filtering.
  outros?: boolean;
}

// ChartRow: stacked Conforme / Não Conforme segments plus count and hover target.
export function ChartRow(
  {
    d,
    index,
    y,
    dimmed,
    labelW,
    barH,
    rowH,
    w,
    onHover,
    onLeave,
    onSelect,
    active = false,
    outros = false,
  }: Props,
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
  // Outros aggregates render muted so they read as a folder, not a category.
  const fillC = outros ? "#94a3b8" : "#22c55e";
  const fillN = outros ? "#f87171" : "#ef4444";
  const clickable = onSelect !== undefined;
  return (
    <g
      className="animate-chart-row"
      onMouseMove={(e) => onHover(index, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      onClick={clickable ? () => onSelect(d.name) : undefined}
      onKeyDown={clickable
        ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(d.name);
          }
        }
        : undefined}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? d.name : undefined}
      style={{
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity .22s var(--ease-std)",
        animationDelay: `${Math.min(index * 45, 360)}ms`,
        cursor: clickable ? "pointer" : undefined,
        outline: active ? "1px solid var(--accent)" : undefined,
        outlineOffset: -1,
      }}
    >
      <text
        x={labelW - 8}
        y={y + 14}
        style={{
          textAnchor: "end",
          fontSize: "var(--d-small)",
          fill: "var(--text-secondary)",
          fontStyle: outros ? "italic" : undefined,
        }}
      >
        {truncateLabel(d.name)}
        <title>{outros ? `${d.name} — clique para expandir` : d.name}</title>
      </text>
      <rect
        x={labelW}
        y={y}
        width={wC}
        height={barH}
        rx={d["Não Conforme"] === 0 ? 4 : 0}
        fill={fillC}
        opacity={outros ? 0.55 : 1}
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
        fill={fillN}
        opacity={outros ? 0.55 : 1}
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
