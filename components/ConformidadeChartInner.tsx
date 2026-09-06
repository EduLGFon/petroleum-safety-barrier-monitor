// Conformidade chart inner - stacked horizontal bars as pure SVG.
// This is why it exists: dependency-free replacement for recharts with
// the same data contract (Conforme vs Nao Conforme per category).
import type { CategoryConformidade } from "../lib/types.ts";

interface Props {
  data: CategoryConformidade[];
}

const ROW_H = 26;
const LABEL_W = 200;
const BAR_H = 18;
const TOP = 4;

export default function ConformidadeChartInner({ data }: Props) {
  const max = Math.max(1, ...data.map((d) => d.Conforme + d["Não Conforme"]));
  const height = TOP + data.length * ROW_H + 30;
  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 640 ${height}`}
        role="img"
        aria-label="Conformidade por categoria"
      >
        {data.map((d, i) => {
          const total = d.Conforme + d["Não Conforme"];
          const w = (v: number) =>
            Math.max(0, (v / max) * (640 - LABEL_W - 20));
          const y = TOP + i * ROW_H;
          return (
            <g key={d.name}>
              <text
                x={LABEL_W - 8}
                y={y + 14}
                textAnchor="end"
                fontSize={12}
                fill="var(--text-secondary)"
              >
                {d.name.length > 26 ? d.name.slice(0, 26) + "..." : d.name}
                <title>{d.name}</title>
              </text>
              <rect
                x={LABEL_W}
                y={y}
                width={w(d.Conforme)}
                height={BAR_H}
                rx={d["Não Conforme"] === 0 ? 4 : 0}
                fill="#22c55e"
              >
                <title>
                  {`Conforme: ${d.Conforme.toLocaleString("pt-BR")}`}
                </title>
              </rect>
              <rect
                x={LABEL_W + w(d.Conforme)}
                y={y}
                width={w(d["Não Conforme"])}
                height={BAR_H}
                rx={4}
                fill="#ef4444"
              >
                <title>
                  {`Nao Conforme: ${d["Não Conforme"].toLocaleString("pt-BR")}`}
                </title>
              </rect>
              {total > 0 && (
                <text
                  x={LABEL_W + w(total) + 6}
                  y={y + 14}
                  fontSize={12}
                  fill="var(--text-muted)"
                >
                  {total.toLocaleString("pt-BR")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "var(--text-muted)",
          paddingTop: 10,
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
          Nao Conforme
        </span>
      </div>
    </div>
  );
}
