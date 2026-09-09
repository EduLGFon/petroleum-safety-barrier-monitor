// Settings storage - loadSettings with per-field validation plus save helper for the barrier-settings key.
// This is why it exists: isolates localStorage hydration and persistence from the provider so it stays slim.
import type { AccentColor, Density, SettingsState } from "./presets.ts";
import { ACCENT_PRESETS, DEFAULTS, KEY } from "./presets.ts";
import { sanitizeFilterPatch } from "../../lib/utils.ts";
import type { Theme } from "../../lib/types.ts";

// Loads persisted settings from `barrier-settings` key; SSR-safe, merges over DEFAULTS.
// Every field is validated so tampered or stale JSON falls back per-field
// instead of crashing hydration (e.g. unknown accent) or wedging filters.
export function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return DEFAULTS;
    const raw = JSON.parse(s) as Partial<SettingsState>;
    const theme: Theme = raw.theme === "light" || raw.theme === "amoled" ||
        raw.theme === "dark"
      ? raw.theme
      : DEFAULTS.theme;
    const accentColor: AccentColor = typeof raw.accentColor === "string" &&
        raw.accentColor in ACCENT_PRESETS
      ? raw.accentColor as AccentColor
      : DEFAULTS.accentColor;
    const density: Density = raw.density === "compact" ||
        raw.density === "spacious"
      ? raw.density
      : DEFAULTS.density;
    const defaultLocation = typeof raw.defaultLocation === "string" &&
        raw.defaultLocation.trim() !== ""
      ? raw.defaultLocation
      : DEFAULTS.defaultLocation;
    const members = Array.isArray(raw.members)
      ? raw.members.filter((m) =>
        m && typeof m.email === "string" &&
        (m.role === "admin" || m.role === "viewer") &&
        typeof m.addedAt === "string"
      )
      : DEFAULTS.members;
    return {
      ...DEFAULTS,
      ...raw,
      theme,
      accentColor,
      density,
      defaultLocation,
      reduceMotion: typeof raw.reduceMotion === "boolean"
        ? raw.reduceMotion
        : DEFAULTS.reduceMotion,
      members,
      // defaultFilters is applied to live dashboard state: keep only
      // well-formed keys, drop the rest instead of spreading blindly.
      defaultFilters: sanitizeFilterPatch(raw.defaultFilters),
    };
  } catch {
    return DEFAULTS;
  }
}

// Persists next state to `barrier-settings` key; tolerates unavailable storage, still applies live.
export function saveSettings(next: SettingsState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode) - settings still apply live.
  }
}
