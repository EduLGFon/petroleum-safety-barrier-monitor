// Settings context - persists theme, accent, defaults and members.
// This is why it exists: single store for appearance and filter defaults,
// hydrated from localStorage after mount for SSR consistency.
import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import type { FilterState, Theme } from "../lib/types.ts";

export type AccentColor =
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
  accentColor: "blue",
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

function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const s = localStorage.getItem(KEY);
    return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function applyAccent(c: AccentColor) {
  const p = ACCENT_PRESETS[c];
  const r = document.documentElement;
  r.style.setProperty("--accent", p.primary);
  r.style.setProperty("--accent-2", p.secondary);
  r.style.setProperty("--glow", p.glow);
  r.style.setProperty("--kpi-grad-1", p.grad1);
  r.style.setProperty("--kpi-grad-4", p.grad4);
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle("no-anim", reduce);
}
function applyDensity(d: Density) {
  const key: Density = d === "compact" || d === "spacious" ? d : "comfortable";
  // Density only switches tokens: every component sizes itself from
  // var(--d-*) (see styles.css), so the whole UI re-rhythms at once.
  document.documentElement.dataset.density = key;
}
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

  const save = useCallback((next: SettingsState) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode) - settings still apply live.
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    save({ ...settings, theme: t });
  }, [settings, save]);
  const setAccent = useCallback((c: AccentColor) => {
    applyAccent(c);
    save({ ...settings, accentColor: c });
  }, [settings, save]);
  const setDensity = useCallback((d: Density) => {
    applyDensity(d);
    save({ ...settings, density: d });
  }, [settings, save]);
  const setDefaults = useCallback((f: Partial<FilterState>) => {
    save({ ...settings, defaultFilters: f });
  }, [settings, save]);
  const setDefaultLoc = useCallback((l: string) => {
    save({ ...settings, defaultLocation: l });
  }, [settings, save]);
  const setReduceMotion = useCallback((v: boolean) => {
    applyMotion(v);
    save({ ...settings, reduceMotion: v });
  }, [settings, save]);
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

export function useSettings() {
  return useContext(SettingsCtx);
}
