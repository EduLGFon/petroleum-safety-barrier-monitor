// FontSizePicker.tsx - text-size grid for the appearance section.
// Why: isolates the preset rendering so AppearanceSection stays focused on
// composing the appearance controls.
import {
  FONT_SIZE_PRESETS,
  type FontSize,
} from "../../context/SettingsContext.tsx";
import { SectTitle } from "./SectionPrimitives.tsx";

interface Props {
  fontSize: FontSize;
  activeFontSize: FontSize | null;
  onFontSize: (f: FontSize) => void;
}

// FontSizePicker: grid of preset buttons with an Aa scale preview.
export function FontSizePicker(
  { fontSize, activeFontSize, onFontSize }: Props,
) {
  return (
    <div>
      <SectTitle>Tamanho do texto</SectTitle>
      <div
        role="group"
        aria-label="Tamanho do texto"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: "var(--d-opt-gap)",
        }}
      >
        {(Object.entries(FONT_SIZE_PRESETS) as [
          FontSize,
          typeof FONT_SIZE_PRESETS[FontSize],
        ][]).map(([value, p]) => {
          const isA = fontSize === value;
          const isAnim = activeFontSize === value;
          return (
            <button
              type="button"
              key={value}
              onClick={() => onFontSize(value)}
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
              <span
                aria-hidden="true"
                style={{
                  fontSize: `${p.scale}em`,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: isA ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                Aa
              </span>
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
                {value === "standard" && (
                  <span
                    style={{
                      fontSize: "var(--d-caption)",
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
                    Recomendado
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
  );
}
