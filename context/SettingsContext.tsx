// Settings context - persists theme, accent, defaults and members.
// This is why it exists: single store for appearance and filter defaults,
// hydrated from localStorage after mount for SSR consistency.
import {
  type AccentColor,
  DEFAULTS,
  type Density,
  type MemberRole,
  type SettingsState,
} from "./settings/presets.ts";
export type {
  AccentColor,
  Density,
  Member,
  MemberRole,
  SettingsState,
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
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
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
  setReduceMotion: (v: boolean) => void;
  addMember: (email: string, role: MemberRole) => void;
  removeMember: (email: string) => void;
}

const SettingsCtx = createContext<Ctx>({
  settings: DEFAULTS,
  setTheme: () => {},
  setAccent: () => {},
  setDensity: () => {},
  setDefaults: () => {},
  setDefaultLoc: () => {},
  setReduceMotion: () => {},
  addMember: () => {},
  removeMember: () => {},
});

// Provides settings store; starts from DEFAULTS for SSR then hydrates from `barrier-settings` after mount.
export function SettingsProvider(
  { children }: { children: ComponentChildren },
) {
  // Start with DEFAULTS for SSR consistency — hydrate from localStorage after mount
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    applyTheme(s.theme);
    applyAccent(s.accentColor);
    applyDensity(s.density);
    applyMotion(s.reduceMotion);
  }, []);

  // Persists next state to `barrier-settings` key; tolerates unavailable storage, still applies live.
  const save = useCallback((next: SettingsState) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // Applies theme to DOM then persists via save (`barrier-settings`).
  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    save({ ...settings, theme: t });
  }, [settings, save]);
  // Applies accent CSS vars then persists via save (`barrier-settings`).
  const setAccent = useCallback((c: AccentColor) => {
    applyAccent(c);
    save({ ...settings, accentColor: c });
  }, [settings, save]);
  // Applies density token then persists via save (`barrier-settings`).
  const setDensity = useCallback((d: Density) => {
    applyDensity(d);
    save({ ...settings, density: d });
  }, [settings, save]);
  // Persists defaultFilters via save (`barrier-settings`); no DOM side effect.
  const setDefaults = useCallback((f: Partial<FilterState>) => {
    save({ ...settings, defaultFilters: f });
  }, [settings, save]);
  // Persists defaultLocation via save (`barrier-settings`); no DOM side effect.
  const setDefaultLoc = useCallback((l: string) => {
    save({ ...settings, defaultLocation: l });
  }, [settings, save]);
  // Toggles .no-anim class then persists via save (`barrier-settings`).
  const setReduceMotion = useCallback((v: boolean) => {
    applyMotion(v);
    save({ ...settings, reduceMotion: v });
  }, [settings, save]);
  // Appends member (deduped by email) then persists via save (`barrier-settings`).
  const addMember = useCallback((email: string, role: MemberRole) => {
    if (settings.members.some((m) => m.email === email)) return;
    save({
      ...settings,
      members: [...settings.members, {
        email,
        role,
        addedAt: new Date().toISOString(),
      }],
    });
  }, [settings, save]);
  // Removes member by email then persists via save (`barrier-settings`).
  const removeMember = useCallback((email: string) => {
    save({
      ...settings,
      members: settings.members.filter((m) => m.email !== email),
    });
  }, [settings, save]);

  return (
    <SettingsCtx.Provider
      value={{
        settings,
        setTheme,
        setAccent,
        setDensity,
        setDefaults,
        setDefaultLoc,
        setReduceMotion,
        addMember,
        removeMember,
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
