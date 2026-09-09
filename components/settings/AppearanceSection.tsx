// AppearanceSection.tsx - theme/density/accent pickers plus reduce-motion and preview.
// Why: groups all appearance controls so the SettingsPanel shell stays focused on drawer chrome.
import type {
  AccentColor,
  Density,
  SettingsState,
} from "../../context/SettingsContext.tsx";
import { SectTitle, Toggle } from "./SectionPrimitives.tsx";
import { DensityPicker } from "./DensityPicker.tsx";
import { AccentPicker } from "./AccentPicker.tsx";
import { ThemePicker } from "./ThemePicker.tsx";
import type { Theme } from "../../lib/types.ts";

interface Props {
  settings: SettingsState;
  activeTheme: Theme | null;
  activeDensity: Density | null;
  activeAccent: AccentColor | null;
  onTheme: (t: Theme) => void;
  onDensity: (d: Density) => void;
  onAccent: (c: AccentColor) => void;
  onReduceMotion: (v: boolean) => void;
}

// AppearanceSection: stacks pickers, accessibility toggle, and accent preview.
export function AppearanceSection(
  {
    settings,
    activeTheme,
    activeDensity,
    activeAccent,
    onTheme,
    onDensity,
    onAccent,
    onReduceMotion,
  }: Props,
) {
  return (
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--d-panel-gap-lg)",
      }}
    >
      <ThemePicker
        theme={settings.theme}
        activeTheme={activeTheme}
        onTheme={onTheme}
      />
      <DensityPicker
        density={settings.density}
        activeDensity={activeDensity}
        onDensity={onDensity}
      />
      <AccentPicker
        accentColor={settings.accentColor}
        activeAccent={activeAccent}
        onAccent={onAccent}
      />
      {/* Reduce motion toggle */}
      <div>
        <SectTitle>Acessibilidade</SectTitle>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--d-row-pad)",
            background: "var(--bg-elevated)",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--d-row-radius)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--d-lead)",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Reduzir animações
            </div>
            <div
              style={{
                fontSize: "var(--d-small)",
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              Desativa transições e efeitos visuais
            </div>
          </div>
          <Toggle
            checked={settings.reduceMotion}
            onChange={onReduceMotion}
          />
        </div>
      </div>
      {/* Preview */}
      <div
        style={{
          padding: "var(--d-preview-pad)",
          background: "color-mix(in srgb,var(--accent) 7%,var(--bg-elevated))",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-row-radius)",
        }}
      >
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 700,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "var(--d-opt-gap)",
          }}
        >
          Prévia
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--d-opt-gap)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "var(--d-chip-pad)",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: "var(--d-chip-radius)",
              fontSize: "var(--d-small)",
              fontWeight: 700,
            }}
          >
            Ativo
          </span>
          <span
            style={{
              padding: "var(--d-chip-pad)",
              background: "transparent",
              border: "1.5px solid var(--accent)",
              color: "var(--accent)",
              borderRadius: "var(--d-chip-radius)",
              fontSize: "var(--d-small)",
              fontWeight: 600,
            }}
          >
            Contorno
          </span>
          <span
            style={{
              padding: "var(--d-chip-pad)",
              background: "var(--bg-surface)",
              border: "1.5px solid var(--border)",
              color: "var(--text-secondary)",
              borderRadius: "var(--d-chip-radius)",
              fontSize: "var(--d-small)",
            }}
          >
            Neutro
          </span>
        </div>
      </div>
    </div>
  );
}
