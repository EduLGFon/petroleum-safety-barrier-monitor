// Status color maps and deterministic fallbacks for unknown values - split from lib/constants.ts to keep files small; why: keeps chart/table color logic with graceful dynamic-data handling.
export const DISP_COLORS: Record<
  string,
  { solid: string; bg: string; border: string; grad: string }
> = {
  "Disponível": {
    solid: "#22c55e",
    bg: "rgba(34,197,94,.1)",
    border: "rgba(34,197,94,.28)",
    grad: "linear-gradient(135deg,#14532d,#16a34a)",
  },
  "Fora de Operação": {
    solid: "#f59e0b",
    bg: "rgba(245,158,11,.1)",
    border: "rgba(245,158,11,.28)",
    grad: "linear-gradient(135deg,#78350f,#d97706)",
  },
  "Indisponível Contingenciado": {
    solid: "#38bdf8",
    bg: "rgba(56,189,248,.1)",
    border: "rgba(56,189,248,.28)",
    grad: "linear-gradient(135deg,#0c4a6e,#0284c7)",
  },
  "Degradado Contingenciado": {
    solid: "#a78bfa",
    bg: "rgba(167,139,250,.1)",
    border: "rgba(167,139,250,.28)",
    grad: "linear-gradient(135deg,#4c1d95,#7c3aed)",
  },
  "Degradado": {
    solid: "#fb923c",
    bg: "rgba(251,146,60,.1)",
    border: "rgba(251,146,60,.28)",
    grad: "linear-gradient(135deg,#7c2d12,#ea580c)",
  },
  "Indisponível": {
    solid: "#ef4444",
    bg: "rgba(239,68,68,.1)",
    border: "rgba(239,68,68,.28)",
    grad: "linear-gradient(135deg,#7f1d1d,#dc2626)",
  },
};

export const CONF_COLORS: Record<
  string,
  { solid: string; bg: string; border: string }
> = {
  "Conforme": {
    solid: "#22c55e",
    bg: "rgba(34,197,94,.1)",
    border: "rgba(34,197,94,.28)",
  },
  "Não Conforme": {
    solid: "#ef4444",
    bg: "rgba(239,68,68,.1)",
    border: "rgba(239,68,68,.28)",
  },
};

export const CRIT_COLORS: Record<
  string,
  { solid: string; bg: string; border: string }
> = {
  "Crítica": {
    solid: "#f97316",
    bg: "rgba(249,115,22,.1)",
    border: "rgba(249,115,22,.28)",
  },
  "Não Crítica": {
    solid: "#94a3b8",
    bg: "rgba(148,163,184,.1)",
    border: "rgba(148,163,184,.28)",
  },
};

// Canonical order for the well-known disponibilidade values. Anything new
// sorts after these (by volume) so bands and reports stay stable across
// deploys. Shared by StatusBand and export summaries - single source.
export const DISP_KNOWN_ORDER = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];

interface ColorSet {
  solid: string;
  bg: string;
  border: string;
  grad?: string;
}

// Deterministic fallback color for values added after deploy (new statuses,
// criticalities, ...). Hashes the label into a hue so the same value always
// gets the same color across renders, sessions and components.
function hashHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

// Builds deterministic hue-based ColorSet for unknown runtime values.
export function fallbackColors(key: string): ColorSet {
  const h = hashHue(key);
  return {
    solid: `hsl(${h} 70% 55%)`,
    bg: `hsl(${h} 70% 55% / .1)`,
    border: `hsl(${h} 70% 55% / .28)`,
    grad: `linear-gradient(135deg,hsl(${h} 60% 28%),hsl(${h} 70% 45%))`,
  };
}

/** Lookup with graceful fallback - never returns undefined for new values. */
export function dispColorFor(key: string): ColorSet {
  return { ...fallbackColors(key), ...DISP_COLORS[key] };
}
// Conformidade colors with deterministic fallback for new values.
export function confColorFor(key: string): ColorSet {
  return { ...fallbackColors(key), ...CONF_COLORS[key] };
}
// Criticidade colors with deterministic fallback for new values.
export function critColorFor(key: string): ColorSet {
  return { ...fallbackColors(key), ...CRIT_COLORS[key] };
}

/** Short label for status band segments - known values use curated shorts,
 *  future values auto-abbreviate to their first two words. */
export function shortStatusLabel(key: string): string {
  const known: Record<string, string> = {
    "Disponível": "Disponível",
    "Fora de Operação": "Fora de Op.",
    "Indisponível Contingenciado": "Indisp. Cont.",
    "Degradado Contingenciado": "Degr. Cont.",
    "Degradado": "Degradado",
    "Indisponível": "Indisponível",
  };
  if (known[key]) return known[key];
  const words = key.split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(" ") : key;
}
