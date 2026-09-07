// Conformidade chart card - section wrapper around the SVG bars.
// This is why it exists: keeps the card frame stable while the inner
// chart stays dependency-free (no dynamic import needed in Fresh).
import Chart from "./ConformidadeChartInner.tsx";
import type { CategoryConformidade } from "../lib/types.ts";

interface Props {
  data: CategoryConformidade[];
}

// Scroll budget: past this many rows the plot scrolls inside the card
// instead of growing the page into a 70-row tower.
const SCROLL_AFTER_ROWS = 18;

export function ConformidadeChart({ data }: Props) {
  const scroll = data.length > SCROLL_AFTER_ROWS;
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
        Conformidade por Categoria · {data.length}
      </div>
      <div
        style={scroll
          ? {
            maxHeight: "min(60vh, 520px)",
            overflowY: "auto",
            paddingRight: 4,
          }
          : undefined}
      >
        <Chart data={data} />
      </div>
    </div>
  );
}
