// Sync status pill - one-line Fracttal sync freshness for the dashboard.
// This is why it exists: operators need to see at a glance whether the
// data is fresh, syncing, or stale-failed - without opening logs. Purely
// presentational: the island hook fetches the status, this only renders it.
// Visible labels stay short codes plus pt-BR freshness; the full last-run
// detail (counts, timestamps, note) rides the hover tooltip.
import type { SyncStatus } from "../lib/types.ts";

import { fmt, timeAgoPt } from "../lib/utils.ts";

import { AURORA } from "../lib/aurora.ts";

// runDetail flattens one finished run into the tooltip line.
function runDetail(
  run: NonNullable<SyncStatus["lastRun"]>,
): string {
  return `${run.scope} ${run.status} - i:${run.inserts} u:${run.updates} ` +
    `d:${run.deletes} s:${run.skips} em ${run.finishedAt}` +
    (run.note ? ` - ${run.note.slice(0, 200)}` : "");
}

// pillCopy resolves the dot color, short label, and tooltip per state.
// User-facing strings stay in Portuguese (pt-BR).
function pillCopy(status: SyncStatus): {
  color: string;
  label: string;
  tip: string;
  pulse: boolean;
} {
  const totals = `${fmt(status.totals.barriers)} barreiras`;
  if (status.state === "syncing") {
    return {
      color: "#f5a524",
      label: "Sincronizando…",
      tip:
        `Sincronização em andamento desde ${status.runningSince} (${totals})`,
      pulse: true,
    };
  }
  if (status.state === "stale") {
    const last = status.lastRun ? ` Última: ${runDetail(status.lastRun)}.` : "";
    return {
      color: "#f31260",
      label: "Sincronização possivelmente travada",
      tip: `Há uma execução presa há mais de 15 minutos.${last} (${totals})`,
      pulse: false,
    };
  }
  if (status.lastRun === null) {
    return {
      color: "#a1a1aa",
      label: "Sem sincronizações",
      tip: `Nenhuma execução registrada (${totals})`,
      pulse: false,
    };
  }
  if (status.lastRun.status === "failed") {
    return {
      color: "#f31260",
      label: "Falha na sincronização",
      tip: `Última: ${runDetail(status.lastRun)} (${totals})`,
      pulse: false,
    };
  }
  return {
    color: "#17c964",
    label: `Sincronizado ${timeAgoPt(status.lastRun.finishedAt)}`,
    tip: `Última: ${runDetail(status.lastRun)} (${totals})`,
    pulse: false,
  };
}

// SyncStatusPill: compact status dot + label; null status renders nothing
// (loading or mock mode, where no sync exists).
export function SyncStatusPill({ status }: { status: SyncStatus | null }) {
  if (status === null) return null;
  const { color, label, tip, pulse } = pillCopy(status);
  return (
    <span
      title={tip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: AURORA.segRadius,
        border: `1px solid ${AURORA.segBorder}`,
        background: AURORA.seg,
        color: AURORA.pillText,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation: pulse ? "pulse 1.2s ease-in-out infinite" : "none",
        }}
      />
      {label}
    </span>
  );
}
