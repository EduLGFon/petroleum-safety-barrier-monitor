// ChartTreemap - treemap view for the compliance chart card.
// This is why it exists: the only view showing all ~67 categories with no
// scroll. Tile area = item volume, tile color = % Não Conforme
// (green→red), so both size and risk read at a glance. Tiles click through
// to the table filter like every other chart view.
import { computeTreemap, truncateLabel } from "../../lib/dashboard/chart.ts";
import type { CategoryCompliance } from "../../lib/types.ts";
import { useMemo } from "preact/hooks";
import { AURORA } from "../../lib/aurora.ts";

interface Props {
  data: CategoryCompliance[];
  // Click-through: full category name → table filter ("" clears).
  onSelectCategory?: (name: string) => void;
  // Currently filtered category: its tile stays lit, others dim.
  activeCategory?: string;
}

// ChartTreemap: area-proportional category tiles colored by NC rate.
export function ChartTreemap(
  { data, onSelectCategory, activeCategory = "" }: Props,
) {
  const tiles = useMemo(() => computeTreemap(data), [data]);
  if (tiles.length === 0) {
    return (
      <div style={{ fontSize: 13, color: AURORA.sub, padding: "8px 0" }}>
        Sem dados.
      </div>
    );
  }
  return (
    <div>
      <div
        role="group"
        aria-label="Mapa de categorias por volume e não conformidade"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          minHeight: 280,
        }}
      >
        {tiles.map((t) => {
          const on = activeCategory !== "" && t.name === activeCategory;
          const dimmed = activeCategory !== "" && t.name !== activeCategory;
          // Labels only where they fit: fractions are resolution-independent.
          const showName = t.w > 0.085 && t.h > 0.11;
          const showCount = t.w > 0.055 && t.h > 0.075;
          return (
            <button
              key={t.name}
              type="button"
              onClick={onSelectCategory
                ? () => onSelectCategory(t.name)
                : undefined}
              title={`${t.name} — ${t.total.toLocaleString("pt-BR")} itens, ${
                Math.round(t.ncRate * 100)
              }% NC — clique para filtrar`}
              aria-label={`${t.name}, ${t.total} itens, ${
                Math.round(t.ncRate * 100)
              } por cento não conforme`}
              aria-pressed={on}
              style={{
                position: "absolute",
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                width: `${t.w * 100}%`,
                height: `${t.h * 100}%`,
                boxSizing: "border-box",
                margin: 0,
                padding: showName || showCount ? 6 : 0,
                overflow: "hidden",
                border: on ? "2px solid #fff" : "1px solid rgba(0,0,0,.35)",
                borderRadius: 6,
                background: `color-mix(in srgb, #ef4444 ${
                  Math.round(t.ncRate * 100)
                }%, #22c55e)`,
                opacity: dimmed ? 0.35 : 1,
                cursor: onSelectCategory ? "pointer" : "default",
                boxShadow: on ? AURORA.auroraGlow : "none",
                transition: "opacity .22s var(--ease-std)",
                color: "#fff",
                textAlign: "left",
              }}
            >
              {showName && (
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    textShadow: "0 1px 2px rgba(0,0,0,.5)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncateLabel(t.name, 30)}
                </span>
              )}
              {showCount && (
                <span
                  className="tnum"
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    textShadow: "0 1px 2px rgba(0,0,0,.5)",
                  }}
                >
                  {t.total.toLocaleString("pt-BR")}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--d-gap-lg)",
          fontSize: "var(--d-small)",
          color: "var(--text-muted)",
          paddingTop: "var(--d-bar-gap)",
          alignItems: "center",
        }}
      >
        <span>área = volume</span>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          cor = % NC
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 72,
              height: 8,
              borderRadius: 4,
              background: "linear-gradient(90deg,#22c55e,#ef4444)",
            }}
          />
        </span>
        <span className="tnum">{tiles.length} categorias</span>
      </div>
    </div>
  );
}
