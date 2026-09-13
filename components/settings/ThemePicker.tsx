// ThemePicker.tsx - theme grid for the appearance section.
// Why: isolates theme option rendering so AppearanceSection stays under limits.
import { SectTitle } from "./SectionPrimitives.tsx";
import type { Theme } from "../../lib/types.ts";
import { THEMES } from "./settings-options.ts";

interface Props {
  theme: Theme;
  activeTheme: Theme | null;
  onTheme: (t: Theme) => void;
}

// ThemePicker: grid of theme buttons with press animation and active ring.
export function ThemePicker({ theme, activeTheme, onTheme }: Props) {
  return (
    <>
      {/* Theme */}
      <div>
        <SectTitle>Tema da Interface</SectTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--d-opt-gap)",
          }}
        >
          {THEMES.map(({ value, Icon, label }) => {
            const isA = theme === value;
            const isAnim = activeTheme === value;
            return (
              <button
                type="button"
                key={value}
                onClick={() => onTheme(value)}
                className={isAnim ? "animate-theme" : ""}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--d-opt-gap)",
                  padding: "var(--d-opt-pad)",
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
                <div
                  style={{
                    width: "var(--d-thumb)",
                    height: "var(--d-thumb)",
                    borderRadius: "var(--d-thumb-radius)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isA
                      ? "linear-gradient(135deg,var(--accent),var(--accent-2))"
                      : "var(--bg-surface)",
                    boxShadow: isA
                      ? "0 4px 12px var(--glow)"
                      : "var(--shadow-sm)",
                    transition: "all .25s",
                  }}
                >
                  <Icon
                    size={18}
                    color={isA ? "#fff" : "var(--text-muted)"}
                    strokeWidth={2.5}
                  />
                </div>
                <span
                  style={{
                    fontSize: "var(--d-small)",
                    fontWeight: isA ? 700 : 500,
                    color: isA ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                </span>
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
