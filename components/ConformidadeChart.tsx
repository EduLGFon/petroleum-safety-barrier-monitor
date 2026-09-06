// Conformidade chart card - section wrapper around the SVG bars.
// This is why it exists: keeps the card frame stable while the inner
// chart stays dependency-free (no dynamic import needed in Fresh).
import Chart from "./ConformidadeChartInner.tsx";
import type { CategoryConformidade } from "../lib/types.ts";

interface Props {
  data: CategoryConformidade[];
}

export function ConformidadeChart({ data }: Props) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "18px 18px 10px",
        marginBottom: 20,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 14,
        }}
      >
        Conformidade por Categoria
      </div>
      <Chart data={data} />
    </div>
  );
}
