// Settings context - persists theme, accent, and filter defaults.
// This is why it exists: single store for appearance and filter defaults,
// hydrated from localStorage after mount for SSR consistency.
import {
  type AccentColor,
  DEFAULTS,
  type Density,
  type SettingsState,
} from "./settings/presets.ts";

import {
  applyAccent,
  applyDensity,
  applyMotion,
  applyTheme,
} from "./settings/appliers.ts";

export {
  ACCENT_PRESETS,
  DEFAULTS,
  DENSITY_PRESETS,
  KEY,
} from "./settings/presets.ts";

export type {
  AccentColor,
  Density,
  SettingsState,
} from "./settings/presets.ts";

import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "preact/hooks";

import { loadSettings, saveSettings } from "./settings/storage.ts";

import type { FilterState, Theme } from "../lib/types.ts";

import type { ComponentChildren } from "preact";

import { createContext } from "preact";

interface Ctx {
  settings: SettingsState;
  setTheme: (t: Theme) => void;
  setAccent: (c: AccentColor) => void;
  setDensity: (d: Density) => void;
  setDefaults: (f: Partial<FilterState>) => void;
  setDefaultLoc: (l: string) => void;
  // Clears the startup filter defaults back to the shipped DEFAULTS in one
  // write (filters + default location together).
  resetFilterDefaults: () => void;
  setReduceMotion: (v: boolean) => void;
}

const SettingsCtx = createContext<Ctx>({
  settings: DEFAULTS,
  setTheme: () => {},
  setAccent: () => {},
  setDensity: () => {},
  setDefaults: () => {},
  setDefaultLoc: () => {},
  resetFilterDefaults: () => {},
  setReduceMotion: () => {},
});

// Provides settings store; starts from DEFAULTS for SSR then hydrates from `barrier-settings` after mount.
export function SettingsProvider(
  { children }: { children: ComponentChildren },
) {
  // Start with DEFAULTS for SSR consistency - hydrate from localStorage after mount
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  // Latest known settings, kept in a ref instead of read from the render
  // closure: two setters called in the same tick (restore-defaults clears the
  // filters and the default location together) would otherwise both build on
  // the same stale snapshot and the second write would drop the first.
  const latest = useRef<SettingsState>(DEFAULTS);

  useEffect(() => {
    const s = loadSettings();
    latest.current = s;
    setSettings(s);
    applyTheme(s.theme);
    applyAccent(s.accentColor);
    applyDensity(s.density);
    applyMotion(s.reduceMotion);
  }, []);

  // Merges a patch into the current settings, publishes it and persists it to
  // the `barrier-settings` key (tolerates unavailable storage - settings still
  // apply live). Stable identity, so consumers never re-subscribe.
  const patch = useCallback((fields: Partial<SettingsState>) => {
    const next = { ...latest.current, ...fields };
    latest.current = next;
    setSettings(next);
    saveSettings(next);
  }, []);

  // Applies theme to DOM then persists via patch (`barrier-settings`).
  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    patch({ theme: t });
  }, [patch]);
  // Applies accent CSS vars then persists via patch (`barrier-settings`).
  const setAccent = useCallback((c: AccentColor) => {
    applyAccent(c);
    patch({ accentColor: c });
  }, [patch]);
  // Applies density token then persists via patch (`barrier-settings`).
  const setDensity = useCallback((d: Density) => {
    applyDensity(d);
    patch({ density: d });
  }, [patch]);
  // Persists defaultFilters via patch (`barrier-settings`); no DOM side effect.
  const setDefaults = useCallback((f: Partial<FilterState>) => {
    patch({ defaultFilters: f });
  }, [patch]);
  // Persists defaultLocation via patch (`barrier-settings`); no DOM side effect.
  const setDefaultLoc = useCallback((l: string) => {
    patch({ defaultLocation: l });
  }, [patch]);
  // Restores the shipped startup defaults in ONE write (filters + default
  // location), so a second click behaves exactly like the first.
  const resetFilterDefaults = useCallback(() => {
    patch({
      defaultFilters: { ...DEFAULTS.defaultFilters },
      defaultLocation: DEFAULTS.defaultLocation,
    });
  }, [patch]);
  // Toggles .no-anim class then persists via patch (`barrier-settings`).
  const setReduceMotion = useCallback((v: boolean) => {
    applyMotion(v);
    patch({ reduceMotion: v });
  }, [patch]);

  return (
    <SettingsCtx.Provider
      value={{
        settings,
        setTheme,
        setAccent,
        setDensity,
        setDefaults,
        setDefaultLoc,
        resetFilterDefaults,
        setReduceMotion,
      }}
    >
      {children}
    </SettingsCtx.Provider>
  );
}

// Returns the hydrated settings store; must be used inside SettingsProvider.
export function useSettings() {
  return useContext(SettingsCtx);
}
