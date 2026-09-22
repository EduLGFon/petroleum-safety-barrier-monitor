// Formatters - pt-BR dates, durations, and numbers shared by UI and exports.
// This is why it exists: one locale policy (SIM_DATE-relative durations,
// DD/MM/YYYY, thousands separators) instead of scattered toLocaleString calls.
import { SIM_DATE } from "./constants.ts";

// Days from ISO date to SIM_DATE, floored and clamped at 0 so future dates
// never go negative; malformed input yields 0 instead of NaN downstream.
export function daysSince(d: string): number {
  const ms = new Date(d).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(
    0,
    Math.floor((SIM_DATE.getTime() - ms) / 86_400_000),
  );
}

// Formats day count as pt-BR duration (dia/semana/mês/ano); days < 2 collapses to "1 dia".
// Non-finite input renders "-" instead of "NaN anos".
export function humanDuration(days: number): string {
  if (!Number.isFinite(days)) return "-";
  if (days < 2) return "1 dia";
  if (days < 7) return `${days} dias`;
  if (days < 14) return "1 semana";
  if (days < 30) return `${Math.floor(days / 7)} semanas`;
  if (days < 60) return "1 mês";
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  const y = Math.floor(days / 365);
  return `${y} ano${y > 1 ? "s" : ""}`;
}

// Converts YYYY-MM-DD to DD/MM/YYYY; malformed input passes through visibly
// instead of rendering "undefined/undefined/...".
export function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
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
// Relative "x ago" in pt-BR from an ISO timestamp ("há 5 min") for live
// freshness labels. Future or malformed input renders "agora mesmo"; the
// optional now makes it deterministic in tests. Never throws.
export function timeAgoPt(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "agora mesmo";
  const secs = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (secs < 60) return "agora mesmo";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}
