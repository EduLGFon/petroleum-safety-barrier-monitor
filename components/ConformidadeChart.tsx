// Conformidade chart card - Aurora glass section around the SVG bars.
// This is why it exists: keeps the card frame stable while the inner
// chart stays dependency-free (no dynamic import needed in Fresh).
import type { CategoryConformidade } from "../lib/types.ts";
import Chart from "./ConformidadeChartInner.tsx";
import { AURORA } from "../lib/aurora.ts";

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
      className="glass-card"
      style={{
        background: AURORA.data,
        border: `1px solid ${AURORA.dataBorder}`,
        borderRadius: AURORA.dataRadius,
        padding: "var(--d-chart-pad)",
        marginBottom: "var(--d-section)",
      }}
    >
      <div
        className="tnum"
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: AURORA.label,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
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
