// AccentPicker.tsx - accent swatch grid for the appearance section.
// Why: isolates accent rendering so AppearanceSection stays under limits.
import {
  ACCENT_PRESETS,
  type AccentColor,
} from "../../context/SettingsContext.tsx";
import { SectTitle } from "./SectionPrimitives.tsx";

interface Props {
  accentColor: AccentColor;
  activeAccent: AccentColor | null;
  onAccent: (c: AccentColor) => void;
}

// AccentPicker: swatch grid with active ring and checkmark overlay.
export function AccentPicker({ accentColor, activeAccent, onAccent }: Props) {
  return (
    <>
      {/* Accent colour */}
      <div>
        <SectTitle>Cor Predominante</SectTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(var(--d-swatch),1fr))",
            gap: "var(--d-bar-gap)",
          }}
        >
          {(Object.entries(ACCENT_PRESETS) as [
            AccentColor,
            typeof ACCENT_PRESETS[AccentColor],
          ][]).map(([key, p]) => {
            const isA = accentColor === key;
            const isAnim = activeAccent === key;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--d-mini-gap)",
                }}
              >
                <button
                  type="button"
                  onClick={() => onAccent(key)}
                  className={isAnim ? "animate-swatch" : ""}
                  style={{
                    width: "var(--d-swatch)",
                    height: "var(--d-swatch)",
                    borderRadius: "var(--d-thumb-radius)",
                    background: p.swatch,
                    border: isA
                      ? "3px solid var(--text-primary)"
                      : "3px solid transparent",
                    cursor: "pointer",
                    transition: "all .2s var(--ease-std)",
                    boxShadow: isA
                      ? `0 0 16px ${p.swatch}88,0 4px 12px ${p.swatch}44`
                      : `0 2px 6px ${p.swatch}44`,
                    transform: isA ? "scale(1.1)" : "scale(1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isA && (
                    <svg
                      width="13"
                      height="10"
                      viewBox="0 0 13 10"
                      fill="none"
                    >
                      <path
                        d="M1 5L4.5 8.5L12 1"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <span
                  style={{
                    fontSize: "var(--d-tiny)",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
