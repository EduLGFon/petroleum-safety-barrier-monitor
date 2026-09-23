// Sync indicator model - pure health decision plus pt-BR formatters.
// This is why it exists: Header needs one merged connection + sync state
// without embedding date math or precedence rules in JSX. No Preact here,
// so the mapper stays unit-testable and reusable from any component.
import type { Conn } from "../hooks/useConnection.ts";

import type { SyncStatus } from "./types.ts";

import { timeAgoPt } from "./format.ts";

// Deltas: per-run item counts plus derived totals for chips and hover.
export interface Deltas {
  inserts: number;
  updates: number;
  deletes: number;
  skips: number;
  changed: number;
  net: number;
}

// HealthKind: single merged state the dot and subtitle line render.
export type HealthKind =
  | "synced"
  | "syncing"
  | "failed"
  | "stale"
  | "never"
  | "offline";

// UnifiedHealth: resolved dot/label inputs for one conn + sync pair.
export interface UnifiedHealth {
  kind: HealthKind;
  dot: string;
  halo: string;
  label: string;
  animation: string;
}

// Sync palette: solid core per sync state. Connection halo comes from
// AURORA_CONN so accent switching keeps working without JS changes.
export const SYNC_DOT = {
  synced: "#17c964",
  syncing: "#f5a524",
  failed: "#f31260",
  stale: "#f31260",
  never: "#a1a1aa",
  offline: "#f87171",
} as const;

// toDeltas: flattens lastRun counts into chip-ready totals. Null-safe.
export function toDeltas(
  lastRun: SyncStatus["lastRun"],
): Deltas | null {
  if (lastRun === null) return null;
  const inserts = lastRun.inserts ?? 0;
  const updates = lastRun.updates ?? 0;
  const deletes = lastRun.deletes ?? 0;
  const skips = lastRun.skips ?? 0;
  return {
    inserts,
    updates,
    deletes,
    skips,
    changed: inserts + updates + deletes,
    net: inserts - deletes,
  };
}

// toHealthKind: precedence matrix. Offline wins over everything so a dead
// backend never shows a calm green dot; syncing beats idle/failed/stale.
export function toHealthKind(
  sync: SyncStatus | null,
  conn: Conn,
): HealthKind {
  if (conn === "disconnected") return "offline";
  if (sync === null) return "never";
  if (sync.state === "syncing" || conn === "reconnecting") {
    if (sync.state === "syncing") return "syncing";
  }
  if (sync.state === "stale") return "stale";
  if (sync.state === "unknown" || sync.lastRun === null) return "never";
  if (sync.lastRun.status === "failed") return "failed";
  return "synced";
}

// InstantParts: absolute local date/time plus relative fallback.
export interface InstantParts {
  date: string;
  time: string;
  dateTime: string;
  full: string;
  relative: string;
}

// formatInstant: browser-timezone absolute parts via Intl. Never throws;
// malformed input falls back to the raw string with an "agora mesmo" rel.
export function formatInstant(iso: string | null): InstantParts | null {
  if (iso === null) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) {
    return { date: iso, time: "", dateTime: iso, full: iso, relative: "" };
  }
  const d = new Date(ms);
  let date = "";
  let time = "";
  let full = "";
  try {
    date = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
    time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
    full = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    date = iso.slice(0, 10);
    time = iso.slice(11, 19);
    full = iso;
  }
  return {
    date,
    time,
    dateTime: `${time} ${date}`,
    full,
    relative: timeAgoPt(iso),
  };
}

// formatDuration: precise pt-BR run length down to the millisecond
// ("450 ms", "8 s 320 ms", "2 min 14 s", "1 h 3 min"). Malformed or
// negative input renders "-" instead of NaN downstream.
export function formatDuration(startedAt: string, finishedAt: string): string {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const wholeSecs = Math.floor(ms / 1000);
  const remMs = Math.round(ms - wholeSecs * 1000);
  if (wholeSecs < 60) {
    return remMs > 0 ? `${wholeSecs} s ${remMs} ms` : `${wholeSecs} s`;
  }
  const mins = Math.floor(wholeSecs / 60);
  if (mins < 60) return `${mins} min ${wholeSecs % 60} s`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// SCOPE_LABELS: technical sync scopes mapped to plain pt-BR origin names.
const SCOPE_LABELS: Record<string, string> = {
  "all": "Todas as instalações",
  "fracttal-live:all": "Fracttal - todas as instalações",
  "fracttal-cycle": "Verificação do ciclo",
  "dump-import": "Importação de arquivo",
};

// friendlyScope: human origin name for a raw sync scope. Unknown scopes
// are prettified (separators become spaces) instead of leaking raw codes.
export function friendlyScope(scope: string): string {
  const hit = SCOPE_LABELS[scope.trim().toLowerCase()];
  if (hit !== undefined) return hit;
  const pretty = scope.replace(/[_:;-]+/g, " ").replace(/\s+/g, " ").trim();
  return pretty === "" ? scope : pretty;
}

// healthLabel: short pt-BR subtitle prefix per merged kind.
export function healthLabel(kind: HealthKind): string {
  if (kind === "syncing") return "Sincronizando…";
  if (kind === "failed") return "Falha na sincronização";
  if (kind === "stale") return "Sincronização possivelmente travada";
  if (kind === "never") return "Sem sincronizações";
  if (kind === "offline") return "Offline";
  return "Sincronizado";
}
