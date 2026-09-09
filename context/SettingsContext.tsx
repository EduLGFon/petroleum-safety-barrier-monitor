// Settings context - persists theme, accent, defaults and members.
// This is why it exists: single store for appearance and filter defaults,
// hydrated from localStorage after mount for SSR consistency.
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import type { FilterState, Theme } from "../lib/types.ts";
import { sanitizeFilterPatch } from "../lib/utils.ts";
import type { ComponentChildren } from "preact";
import { createContext } from "preact";

export type AccentColor =
  | "aurora"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "brown"
  | "mono"
  | "purple";

export const ACCENT_PRESETS: Record<
  AccentColor,
  {
    label: string;
    swatch: string;
    primary: string;
    secondary: string;
    glow: string;
    grad1: string;
    grad4: string;
  }
> = {
  aurora: {
    label: "Aurora",
    swatch: "#6366f1",
    primary: "#6366f1",
    secondary: "#22d3ee",
    glow: "rgba(99,102,241,.35)",
    grad1: "linear-gradient(90deg,#6366f1,#22d3ee)",
    grad4: "linear-gradient(90deg,#6366f1,#22d3ee)",
  },
  blue: {
    label: "Azul",
    swatch: "#3b82f6",
    primary: "#3b82f6",
    secondary: "#6366f1",
    glow: "rgba(59,130,246,.18)",
    grad1: "linear-gradient(135deg,#1e3a8a,#2563eb)",
    grad4: "linear-gradient(135deg,#1e3a8a,#4f46e5)",
  },
  green: {
    label: "Verde",
    swatch: "#22c55e",
    primary: "#22c55e",
    secondary: "#10b981",
    glow: "rgba(34,197,94,.18)",
    grad1: "linear-gradient(135deg,#14532d,#16a34a)",
    grad4: "linear-gradient(135deg,#14532d,#059669)",
  },
  red: {
    label: "Vermelho",
    swatch: "#ef4444",
    primary: "#ef4444",
    secondary: "#f97316",
    glow: "rgba(239,68,68,.18)",
    grad1: "linear-gradient(135deg,#7f1d1d,#dc2626)",
    grad4: "linear-gradient(135deg,#7c2d12,#ea580c)",
  },
  yellow: {
    label: "Amarelo",
    swatch: "#eab308",
    primary: "#eab308",
    secondary: "#f59e0b",
    glow: "rgba(234,179,8,.18)",
    grad1: "linear-gradient(135deg,#713f12,#ca8a04)",
    grad4: "linear-gradient(135deg,#713f12,#d97706)",
  },
  brown: {
    label: "Marrom",
    swatch: "#b45309",
    primary: "#b45309",
    secondary: "#d97706",
    glow: "rgba(180,83,9,.18)",
    grad1: "linear-gradient(135deg,#431407,#b45309)",
    grad4: "linear-gradient(135deg,#431407,#d97706)",
  },
  mono: {
    label: "Neutro",
    swatch: "#94a3b8",
    primary: "#94a3b8",
    secondary: "#cbd5e1",
    glow: "rgba(148,163,184,.18)",
    grad1: "linear-gradient(135deg,#1e293b,#334155)",
    grad4: "linear-gradient(135deg,#1e293b,#475569)",
  },
  purple: {
    label: "Roxo",
    swatch: "#a855f7",
    primary: "#a855f7",
    secondary: "#c084fc",
    glow: "rgba(168,85,247,.18)",
    grad1: "linear-gradient(135deg,#3b0764,#7c3aed)",
    grad4: "linear-gradient(135deg,#3b0764,#a855f7)",
  },
};

export type Density = "compact" | "comfortable" | "spacious";

export const DENSITY_PRESETS: Record<
  Density,
  { label: string; hint: string }
> = {
  compact: { label: "Compacto", hint: "Telas menores de 16″" },
  comfortable: { label: "Confortável", hint: "Padrão · telas de 16″" },
  spacious: { label: "Amplo", hint: "Monitores maiores de 16″" },
};

export type MemberRole = "admin" | "viewer";
export interface Member {
  email: string;
  role: MemberRole;
  addedAt: string;
}

export interface SettingsState {
  theme: Theme;
  accentColor: AccentColor;
  density: Density;
  defaultFilters: Partial<FilterState>;
  defaultLocation: string;
  reduceMotion: boolean;
  members: Member[];
}

const DEFAULTS: SettingsState = {
  theme: "dark",
  accentColor: "aurora",
  density: "comfortable",
  defaultFilters: {},
  defaultLocation: "ALL",
  reduceMotion: false,
  members: [],
};

const KEY = "barrier-settings";

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

// Loads persisted settings from `barrier-settings` key; SSR-safe, merges over DEFAULTS.
// Every field is validated so tampered or stale JSON falls back per-field
// instead of crashing hydration (e.g. unknown accent) or wedging filters.
function loadSettings(): SettingsState {
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

// Applies accent preset to CSS vars (--accent, --glow, --kpi-grad-*); persisted via save, not here.
// Falls back to the default preset so a tampered accent can never crash hydration.
function applyAccent(c: AccentColor) {
  const p = ACCENT_PRESETS[c] ?? ACCENT_PRESETS[DEFAULTS.accentColor];
  const r = document.documentElement;
  r.style.setProperty("--accent", p.primary);
  r.style.setProperty("--accent-2", p.secondary);
  r.style.setProperty("--glow", p.glow);
  r.style.setProperty("--kpi-grad-1", p.grad1);
  r.style.setProperty("--kpi-grad-4", p.grad4);
}

// Sets documentElement dataset.theme; persisted via save (`barrier-settings`), not here.
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

// Toggles .no-anim class for reduced motion; persisted via save, not here.
function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle("no-anim", reduce);
}
// Applies density token via dataset.density (falls back to comfortable); persisted via save, not here.
function applyDensity(d: Density) {
  const key: Density = d === "compact" || d === "spacious" ? d : "comfortable";
  // Density only switches tokens: every component sizes itself from
  // var(--d-*) (see styles.css), so the whole UI re-rhythms at once.
  document.documentElement.dataset.density = key;
}
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
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode) - settings still apply live.
    }
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
