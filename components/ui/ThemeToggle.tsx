// ThemeToggle - segmented light / dark / AMOLED switcher.
// This is why it exists: exposes SettingsContext theme switching inline in
// the header without opening the full SettingsPanel.
import { useSettings } from "../../context/SettingsContext.tsx";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons.tsx";
import type { FunctionComponent } from "preact";
import type { Theme } from "../../lib/types.ts";
import { AURORA } from "../../lib/aurora.ts";
type I = FunctionComponent<
  { size?: number; color?: string; strokeWidth?: number }
>;
const OPTS: { value: Theme; Icon: I; label: string }[] = [
  { value: "light", Icon: SunIcon, label: "Aurora Claro" },
  { value: "dark", Icon: MoonIcon, label: "Aurora Escura" },
  { value: "amoled", Icon: MonitorIcon, label: "Aurora Black" },
];
export function ThemeToggle() {
  const { settings, setTheme } = useSettings();
  const theme = settings.theme;
  return (
    <div
      style={{
        display: "flex",
        background: AURORA.seg,
        border: `1px solid ${AURORA.segBorder}`,
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {OPTS.map(({ value, Icon, label }) => {
        const a = theme === value;
        return (
          <button
            type="button"
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            aria-pressed={a}
            className={a ? "animate-theme" : ""}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              background: a ? AURORA.grad : "transparent",
              color: a ? "#fff" : AURORA.label,
              boxShadow: a ? "0 2px 6px var(--glow)" : "none",
              transition: "all .22s var(--ease-std)",
            }}
          >
            <Icon
              size={12}
              color={a ? "#fff" : AURORA.label}
              strokeWidth={2.5}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
