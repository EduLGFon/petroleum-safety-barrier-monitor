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
        borderRadius: "var(--d-card-radius)",
        padding: "var(--d-chart-pad)",
        marginBottom: "var(--d-section)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: "var(--d-micro)",
          fontWeight: 800,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: "var(--d-sect-title-gap)",
        }}
      >
        Conformidade por Categoria
      </div>
      <Chart data={data} />
    </div>
  );
}
