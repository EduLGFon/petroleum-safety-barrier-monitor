// DensityPicker.tsx - density grid for the appearance section.
// Why: isolates density option rendering so AppearanceSection stays under limits.
import {
  type Density,
  DENSITY_PRESETS,
} from "../../context/SettingsContext.tsx";
import { DensityGlyph, SectTitle } from "./SectionPrimitives.tsx";

interface Props {
  density: Density;
  activeDensity: Density | null;
  onDensity: (d: Density) => void;
}

// DensityPicker: grid of density buttons with glyph preview and default badge.
export function DensityPicker({ density, activeDensity, onDensity }: Props) {
  return (
    <>
      {/* Density */}
      <div>
        <SectTitle>Densidade da Interface</SectTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--d-opt-gap)",
          }}
        >
          {(Object.entries(DENSITY_PRESETS) as [
            Density,
            typeof DENSITY_PRESETS[Density],
          ][]).map(([value, p]) => {
            const isA = density === value;
            const isAnim = activeDensity === value;
            return (
              <button
                type="button"
                key={value}
                onClick={() => onDensity(value)}
                className={isAnim ? "animate-theme" : ""}
                aria-pressed={isA}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--d-pill-gap)",
                  padding: "var(--d-density-pad)",
                  borderRadius: "var(--d-opt-radius)",
                  border: isA
                    ? "2px solid var(--accent)"
                    : "2px solid var(--border)",
                  background: "var(--bg-elevated)",
                  cursor: "pointer",
                  transition: "all .2s var(--ease-std)",
                  boxShadow: isA ? "0 0 12px var(--glow)" : "none",
                }}
              >
                <DensityGlyph value={value} active={isA} />
                <span
                  style={{
                    fontSize: "var(--d-small)",
                    fontWeight: isA ? 700 : 500,
                    color: isA ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {p.label}
                </span>
                <span
                  style={{
                    fontSize: "var(--d-density-hint)",
                    lineHeight: 1.4,
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {p.hint}
                </span>
                <div
                  style={{
                    minHeight: 18,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {value === "comfortable" && (
                    <span
                      style={{
                        fontSize: "var(--d-tiny)",
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--accent)",
                        background:
                          "color-mix(in srgb,var(--accent) 12%,transparent)",
                        border:
                          "1px solid color-mix(in srgb,var(--accent) 30%,transparent)",
                        borderRadius: "var(--d-pill-sm-radius)",
                        padding: "var(--d-count-pad)",
                      }}
                    >
                      Padrão
                    </span>
                  )}
                </div>
                {isA && (
                  <div
                    style={{
                      width: 20,
                      height: 2,
                      borderRadius: 1,
                      background: "var(--accent)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
