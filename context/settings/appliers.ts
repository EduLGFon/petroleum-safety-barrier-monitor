// Settings appliers - DOM side effects for accent, theme, motion and density tokens.
// This is why it exists: keeps documentElement mutations out of the provider so they stay reusable and testable.
import type { AccentColor, Density } from "./presets.ts";
import { ACCENT_PRESETS, DEFAULTS } from "./presets.ts";
import type { Theme } from "../../lib/types.ts";

// Applies accent preset to CSS vars (--accent, --glow, --kpi-grad-*); persisted via save, not here.
// Falls back to the default preset so a tampered accent can never crash hydration.
export function applyAccent(c: AccentColor) {
  const p = ACCENT_PRESETS[c] ?? ACCENT_PRESETS[DEFAULTS.accentColor];
  const r = document.documentElement;
  r.style.setProperty("--accent", p.primary);
  r.style.setProperty("--accent-2", p.secondary);
  r.style.setProperty("--glow", p.glow);
  r.style.setProperty("--kpi-grad-1", p.grad1);
  r.style.setProperty("--kpi-grad-4", p.grad4);
}

// Sets documentElement dataset.theme; persisted via save (`barrier-settings`), not here.
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

// Toggles .no-anim class for reduced motion; persisted via save, not here.
export function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle("no-anim", reduce);
}
// Applies density token via dataset.density (falls back to comfortable); persisted via save, not here.
export function applyDensity(d: Density) {
  const key: Density = d === "compact" || d === "spacious" ? d : "comfortable";
  // Density only switches tokens: every component sizes itself from
  // var(--d-*) (see styles.css), so the whole UI re-rhythms at once.
  document.documentElement.dataset.density = key;
}
