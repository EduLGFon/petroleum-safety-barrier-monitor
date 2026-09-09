// Settings presets - accent/density catalogs, member/settings types, DEFAULTS and storage KEY.
// This is why it exists: single source of truth shared by context, storage validation and DOM appliers.
import type { FilterState, Theme } from "../../lib/types.ts";

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

export const DEFAULTS: SettingsState = {
  theme: "dark",
  accentColor: "aurora",
  density: "comfortable",
  defaultFilters: {},
  defaultLocation: "ALL",
  reduceMotion: false,
  members: [],
};

export const KEY = "barrier-settings";
