// Formatters - pt-BR dates, durations, and numbers shared by UI and exports.
// This is why it exists: one locale policy (SIM_DATE-relative durations,
// DD/MM/YYYY, thousands separators) instead of scattered toLocaleString calls.
import { SIM_DATE } from "./constants.ts";

// Days from ISO date to SIM_DATE, floored and clamped at 0 so future dates never go negative.
export function daysSince(d: string): number {
  return Math.max(
    0,
    Math.floor((SIM_DATE.getTime() - new Date(d).getTime()) / 86_400_000),
  );
}

// Formats day count as pt-BR duration (dia/semana/mês/ano); days < 2 collapses to "1 dia".
export function humanDuration(days: number): string {
  if (days < 2) return "1 dia";
  if (days < 7) return `${days} dias`;
  if (days < 14) return "1 semana";
  if (days < 30) return `${Math.floor(days / 7)} semanas`;
  if (days < 60) return "1 mês";
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  const y = Math.floor(days / 365);
  return `${y} ano${y > 1 ? "s" : ""}`;
}

// Converts YYYY-MM-DD to DD/MM/YYYY; assumes valid ISO input, no validation.
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// Formats number with pt-BR thousands separator.
export function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}
// Appends % suffix; expects an already-rounded 0-100 value.
export function pct(n: number): string {
  return `${n}%`;
}
