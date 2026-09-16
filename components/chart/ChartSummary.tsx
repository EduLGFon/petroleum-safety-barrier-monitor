// ChartSummary - executive summary view for the compliance chart card.
// This is why it exists: 67 scrolling bars bury the headline. The donut
// answers "how compliant are we" and the Top NC list answers "where is the
// risk", both clickable into the table filter like the bar rows.
import {
  CHART_TOP_NC,
  summarizeCompliance,
  truncateLabel,
} from "../../lib/dashboard/chart.ts";
import type { CategoryCompliance } from "../../lib/types.ts";
import { useMemo } from "preact/hooks";
import { AURORA } from "../../lib/aurora.ts";

interface Props {
  data: CategoryCompliance[];
  // Click-through: full category name → table filter ("" clears).
  onSelectCategory?: (name: string) => void;
  // Currently filtered category: its row stays lit.
  activeCategory?: string;
}

const DONUT_R = 54;
const DONUT_C = 2 * Math.PI * DONUT_R;

// ChartSummary: overall compliance donut beside a Top-NC offender list.
export function ChartSummary(
  { data, onSelectCategory, activeCategory = "" }: Props,
) {
  const summary = useMemo(() => summarizeCompliance(data), [data]);
  const maxNC = summary.topNC[0]?.["Não Conforme"] ?? 1;
  const frac = summary.total === 0 ? 1 : summary.compliant / summary.total;
  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
        }}
      >
        <svg
          width={132}
          height={132}
          viewBox="0 0 132 132"
          role="img"
          aria-label={`Conformidade geral ${
            summary.pctCompliant.toLocaleString("pt-BR")
          }%`}
        >
          <circle
            cx={66}
            cy={66}
            r={DONUT_R}
            fill="none"
            stroke={AURORA.track}
            strokeWidth={14}
          />
          <circle
            cx={66}
            cy={66}
            r={DONUT_R}
            fill="none"
            stroke="#22c55e"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${frac * DONUT_C} ${DONUT_C}`}
            transform="rotate(-90 66 66)"
            style={{
              transition: "stroke-dasharray .55s var(--ease-out)",
            }}
          />
          <text
            x={66}
            y={64}
            textAnchor="middle"
            style={{
              fontSize: 22,
              fontWeight: 700,
              fill: "var(--text-primary)",
            }}
          >
            {summary.pctCompliant.toLocaleString("pt-BR")}%
          </text>
          <text
            x={66}
            y={82}
            textAnchor="middle"
            style={{ fontSize: 10, fill: "var(--text-muted)" }}
          >
            conforme
          </text>
        </svg>
        <div
          className="tnum"
          style={{
            display: "flex",
            gap: 12,
            fontSize: "var(--d-body)",
            color: AURORA.sub,
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
                marginRight: 5,
              }}
            />
            {summary.compliant.toLocaleString("pt-BR")}
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "#ef4444",
                marginRight: 5,
              }}
            />
            {summary.nonCompliant.toLocaleString("pt-BR")}
          </span>
        </div>
      </div>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div
          className="tnum"
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: AURORA.label,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          Maior Não Conforme · Top {CHART_TOP_NC}
        </div>
        {summary.topNC.length === 0
          ? (
            <div
              style={{ fontSize: 13, color: AURORA.sub, padding: "8px 0" }}
            >
              Nenhuma Não Conformidade — todas as categorias conformes.
            </div>
          )
          : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              {summary.topNC.map((d) => {
                const on = activeCategory !== "" &&
                  d.name === activeCategory;
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => onSelectCategory?.(d.name)}
                    title={`${d.name} — filtrar tabela`}
                    aria-pressed={on}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      fontSize: "var(--d-body)",
                      borderRadius: 8,
                      border: on
                        ? "1px solid transparent"
                        : `1px solid ${AURORA.segBorder}`,
                      background: on ? AURORA.grad : AURORA.seg,
                      color: on ? "#fff" : AURORA.pillText,
                      cursor: onSelectCategory ? "pointer" : "default",
                      boxShadow: on ? AURORA.auroraGlow : "none",
                      transition: "all .2s var(--ease-std)",
                    }}
                  >
                    <span
                      style={{
                        flex: "0 1 auto",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                      }}
                    >
                      {truncateLabel(d.name)}
                    </span>
                    <span
                      className="tnum"
                      style={{
                        marginLeft: "auto",
                        flexShrink: 0,
                        fontWeight: 700,
                        color: on ? "#fff" : "#ef4444",
                      }}
                    >
                      {d["Não Conforme"].toLocaleString("pt-BR")}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        flexBasis: 72,
                        flexShrink: 0,
                        height: 6,
                        borderRadius: 3,
                        background: on ? "rgba(255,255,255,.25)" : AURORA.track,
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${
                            Math.max(
                              4,
                              (d["Não Conforme"] / maxNC) * 100,
                            )
                          }%`,
                          borderRadius: 3,
                          background: on
                            ? "#fff"
                            : "linear-gradient(90deg,#f87171,#ef4444)",
                          transition: "width .5s var(--ease-out)",
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
