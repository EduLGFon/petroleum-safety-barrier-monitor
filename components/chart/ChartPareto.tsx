// ChartPareto - Pareto view for the compliance chart card.
// This is why it exists: the Top-N bars show volume but not concentration.
// The cumulative-% line answers "which few categories cover most items",
// with the 80% cutoff marked. Rows click through to the table filter like
// the bar view.
import { computePareto, truncateLabel } from "../../lib/dashboard/chart.ts";
import type { CategoryCompliance } from "../../lib/types.ts";
import { useMemo } from "preact/hooks";
import { AURORA } from "../../lib/aurora.ts";

interface Props {
  data: CategoryCompliance[];
  // Click-through: full category name → table filter ("" clears).
  onSelectCategory?: (name: string) => void;
  // Currently filtered category: its row stays lit, others dim.
  activeCategory?: string;
}

const LABEL_W = 200;
const PLOT_W = 440;
const COUNT_W = 56;
const ROW_H = 26;
const BAR_H = 16;
const TOP = 8;

// ChartPareto: Top-N stacked bars with a cumulative-coverage line overlay.
export function ChartPareto(
  { data, onSelectCategory, activeCategory = "" }: Props,
) {
  const pareto = useMemo(() => computePareto(data), [data]);
  if (pareto.rows.length === 0) {
    return (
      <div style={{ fontSize: 13, color: AURORA.sub, padding: "8px 0" }}>
        Sem dados.
      </div>
    );
  }
  const max = Math.max(
    1,
    ...pareto.rows.map((d) => d.Conforme + d["Não Conforme"]),
  );
  const w = (v: number) => Math.max(0, (v / max) * PLOT_W);
  const cx = (cum: number) => LABEL_W + cum * PLOT_W;
  const height = TOP + pareto.rows.length * ROW_H + 22;
  const width = LABEL_W + PLOT_W + COUNT_W;
  const line = pareto.rows
    .map((_, i) => `${cx(pareto.cumulative[i])},${TOP + i * ROW_H + 13}`)
    .join(" ");
  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pareto de categorias com cobertura acumulada"
      >
        {/* 80% cutoff marker */}
        <line
          x1={cx(0.8)}
          y1={TOP - 2}
          x2={cx(0.8)}
          y2={TOP + pareto.rows.length * ROW_H}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.7}
        />
        <text
          x={cx(0.8)}
          y={TOP + pareto.rows.length * ROW_H + 16}
          style={{
            textAnchor: "middle",
            fontSize: "var(--d-small)",
            fill: "var(--text-muted)",
          }}
        >
          80%
        </text>
        {pareto.rows.map((d, i) => {
          const total = d.Conforme + d["Não Conforme"];
          const dimmed = activeCategory !== "" && d.name !== activeCategory;
          const y = TOP + i * ROW_H;
          const wC = Math.max(w(d.Conforme), d.Conforme > 0 ? 2 : 0);
          const wN = Math.max(
            w(d["Não Conforme"]),
            d["Não Conforme"] > 0 ? 2 : 0,
          );
          return (
            <g
              key={d.name}
              onClick={onSelectCategory
                ? () => onSelectCategory(d.name)
                : undefined}
              onKeyDown={onSelectCategory
                ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectCategory(d.name);
                  }
                }
                : undefined}
              tabIndex={onSelectCategory ? 0 : undefined}
              role={onSelectCategory ? "button" : undefined}
              aria-label={onSelectCategory ? d.name : undefined}
              style={{
                opacity: dimmed ? 0.35 : 1,
                transition: "opacity .22s var(--ease-std)",
                cursor: onSelectCategory ? "pointer" : undefined,
                outline: activeCategory !== "" && d.name === activeCategory
                  ? "1px solid var(--accent)"
                  : undefined,
                outlineOffset: -1,
              }}
            >
              <title>
                {`${d.name} — ${total.toLocaleString("pt-BR")} itens`}
              </title>
              <text
                x={LABEL_W - 8}
                y={y + 14}
                style={{
                  textAnchor: "end",
                  fontSize: "var(--d-small)",
                  fill: "var(--text-secondary)",
                }}
              >
                {truncateLabel(d.name)}
              </text>
              <rect
                x={LABEL_W}
                y={y + (ROW_H - BAR_H) / 2 - 3}
                width={wC}
                height={BAR_H}
                rx={d["Não Conforme"] === 0 ? 4 : 0}
                fill="#22c55e"
              />
              <rect
                x={LABEL_W + w(d.Conforme)}
                y={y + (ROW_H - BAR_H) / 2 - 3}
                width={wN}
                height={BAR_H}
                rx={4}
                fill="#ef4444"
              />
              {/* cumulative dot + label */}
              <circle
                cx={cx(pareto.cumulative[i])}
                cy={y + 13}
                r={4}
                fill="var(--accent-2)"
                stroke="var(--bg-elevated)"
                strokeWidth={1.5}
              />
              <text
                x={LABEL_W + PLOT_W + 8}
                y={y + 14}
                className="tnum"
                style={{
                  fontSize: "var(--d-small)",
                  fill: "var(--text-muted)",
                }}
              >
                {(pareto.cumulative[i] * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}%
              </text>
            </g>
          );
        })}
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent-2)"
          strokeWidth={2}
          opacity={0.85}
        />
      </svg>
      <div
        className="tnum"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--d-gap-lg)",
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          paddingTop: "var(--d-bar-gap)",
        }}
      >
        <span>
          Top {pareto.rows.length} · cobrem{" "}
          {pareto.coveredPct.toLocaleString("pt-BR")}% dos itens
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "var(--accent-2)",
              marginRight: 6,
            }}
          />
          Cobertura acumulada
        </span>
      </div>
    </div>
  );
}
