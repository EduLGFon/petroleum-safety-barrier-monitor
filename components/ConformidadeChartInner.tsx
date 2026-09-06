// Conformidade chart inner - stacked horizontal bars as pure SVG.
// This is why it exists: dependency-free replacement for recharts with
// the same data contract (Conforme vs Nao Conforme per category), axis,
// gridlines and hover tooltip. All SVG text styling goes through `style`
// (never textAnchor/fontSize props) so hydration keeps it intact.
import { useState } from "preact/hooks";
import type { CategoryConformidade } from "../lib/types.ts";
import { useSettings } from "../context/SettingsContext.tsx";

interface Props {
  data: CategoryConformidade[];
}

const COUNT_W = 56;
const TOP = 6;
const AXIS_H = 26;
const PLOT_W = 440;

/* Bar geometry per density — tighter rows on compact, roomier on spacious. */
const GEO = {
  compact: { ROW_H: 21, BAR_H: 14, LABEL_W: 180 },
  comfortable: { ROW_H: 26, BAR_H: 18, LABEL_W: 200 },
  spacious: { ROW_H: 31, BAR_H: 22, LABEL_W: 220 },
} as const;

export default function ConformidadeChartInner({ data }: Props) {
  const [hover, setHover] = useState<
    { i: number; x: number; y: number } | null
  >(
    null,
  );
  const { settings } = useSettings();
  const { ROW_H, BAR_H, LABEL_W } = GEO[settings.density] ?? GEO.comfortable;
  const max = Math.max(1, ...data.map((d) => d.Conforme + d["Não Conforme"]));
  const height = TOP + data.length * ROW_H + AXIS_H;
  const width = LABEL_W + PLOT_W + COUNT_W;
  const ticks = [0, Math.round(max / 2), max];
  const w = (v: number) => Math.max(0, (v / max) * PLOT_W);
  const hovered = hover !== null ? data[hover.i] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Conformidade por categoria"
      >
        {/* gridlines + x ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LABEL_W + w(t)}
              y1={TOP - 2}
              x2={LABEL_W + w(t)}
              y2={TOP + data.length * ROW_H}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={LABEL_W + w(t)}
              y={TOP + data.length * ROW_H + 18}
              style={{
                textAnchor: "middle",
                fontSize: "var(--d-small)",
                fill: "var(--text-muted)",
              }}
            >
              {t.toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const total = d.Conforme + d["Não Conforme"];
          const y = TOP + i * ROW_H;
          const dim = hover !== null && hover.i !== i;
          return (
            <g
              key={d.name}
              opacity={dim ? 0.35 : 1}
              onMouseMove={(e) => setHover({ i, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >
              <text
                x={LABEL_W - 8}
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
                x={LABEL_W}
                y={y}
                width={Math.max(w(d.Conforme), d.Conforme > 0 ? 2 : 0)}
                height={BAR_H}
                rx={d["Não Conforme"] === 0 ? 4 : 0}
                fill="#22c55e"
              />
              <rect
                x={LABEL_W + w(d.Conforme)}
                y={y}
                width={Math.max(
                  w(d["Não Conforme"]),
                  d["Não Conforme"] > 0 ? 2 : 0,
                )}
                height={BAR_H}
                rx={4}
                fill="#ef4444"
              />
              {/* hover target covering the full row width */}
              <rect
                x={LABEL_W}
                y={y - 4}
                width={PLOT_W}
                height={ROW_H}
                fill="transparent"
              />
              {total > 0 && (
                <text
                  x={LABEL_W + w(total) + 8}
                  y={y + 14}
                  style={{
                    fontSize: "var(--d-small)",
                    fill: "var(--text-muted)",
                  }}
                >
                  {total.toLocaleString("pt-BR")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover && (
        <div
          style={{
            position: "fixed",
            left: hover.x + 14,
            top: hover.y + 14,
            zIndex: 1200,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--d-input-radius)",
            padding: "var(--d-tip-pad)",
            fontSize: "var(--d-body)",
            boxShadow: "var(--shadow-md)",
            pointerEvents: "none",
            maxWidth: 260,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 8,
              lineHeight: 1.4,
            }}
          >
            {hovered.name}
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--d-opt-gap)",
              color: "#22c55e",
              fontWeight: 600,
              marginBottom: 3,
            }}
          >
            <span>Conforme:</span>
            <span>{hovered.Conforme.toLocaleString("pt-BR")}</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--d-opt-gap)",
              color: "#ef4444",
              fontWeight: 600,
            }}
          >
            <span>Não Conforme:</span>
            <span>{hovered["Não Conforme"].toLocaleString("pt-BR")}</span>
          </div>
        </div>
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
