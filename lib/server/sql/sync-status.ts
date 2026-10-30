// Sync status SQL helpers - status indicator state decision and DB read.
// Why it exists: keeps the pure status mapper and its DB read in one
// focused module instead of the large sync repository.
import type { SyncStatus } from "../../types.ts";

import { queryRows } from "../db.ts";

// SYNC_FRESH_MINUTES: a running row newer than this means a sync is in
// flight; SYNC_STALE_MINUTES: one older means the poller likely crashed.
export const SYNC_FRESH_MINUTES = 10;
export const SYNC_STALE_MINUTES = 15;

// SyncStatusRow: the raw sync_state shape the status indicator reads.
export interface SyncStatusRow {
  id: number;
  scope: string;
  status: string;
  inserts: number;
  updates: number;
  deletes: number;
  skips: number;
  note: string;
  started_at: string;
  finished_at: string;
}

// isStaleActive: pure guard so superseded orphans never latch `stale`.
export function isStaleActive(
  staleRow: { id: number; started_at: string } | null | undefined,
  latest: Pick<SyncStatusRow, "id" | "finished_at"> | null,
): boolean {
  if (staleRow === null || staleRow === undefined) return false;
  if (latest === null) return true;
  if (staleRow.id !== latest.id) return staleRow.id > latest.id;
  return new Date(staleRow.started_at).getTime() >
    new Date(latest.finished_at).getTime();
}

// toSyncStatus: pure state decision over the three reads below.
export function toSyncStatus(args: {
  latest: SyncStatusRow | null;
  running: { scope: string; started_at: string } | null;
  staleRunning: boolean;
  barriers: number;
}): SyncStatus {
  const totals = { barriers: args.barriers };
  const lastRun = args.latest === null ? null : {
    scope: args.latest.scope,
    status: (args.latest.status === "ok" ? "ok" : "failed") as
      | "ok"
      | "failed",
    startedAt: args.latest.started_at,
    finishedAt: args.latest.finished_at,
    inserts: args.latest.inserts,
    updates: args.latest.updates,
    deletes: args.latest.deletes,
    skips: args.latest.skips,
    note: args.latest.note,
  };
  if (args.running !== null) {
    return {
      state: "syncing",
      runningSince: args.running.started_at,
      lastRun,
      totals,
    };
  }
  if (args.staleRunning) {
    return { state: "stale", runningSince: null, lastRun, totals };
  }
  if (lastRun === null) {
    return { state: "unknown", runningSince: null, lastRun, totals };
  }
  return { state: "idle", runningSince: null, lastRun, totals };
}

// getSyncStatus: dashboard indicator data.
export async function getSyncStatus(): Promise<SyncStatus> {
  const [finished, running, stale, counted] = await Promise.all([
    queryRows<SyncStatusRow>(
      `select id, scope, status, inserts, updates, deletes, skips, note,
        started_at, finished_at
       from sync_state where status != 'running'
       order by id desc limit 1`,
    ),
    queryRows<{ scope: string; started_at: string }>(
      `select scope, started_at from sync_state
       where status = 'running'
         and finished_at >= now() - make_interval(mins => $1)
       order by id desc limit 1`,
      [SYNC_FRESH_MINUTES],
    ),
    queryRows<{ id: number; started_at: string }>(
      `select id, started_at from sync_state
       where status = 'running'
         and finished_at < now() - make_interval(mins => $1)
       order by id desc limit 1`,
      [SYNC_STALE_MINUTES],
    ),
    queryRows<{ n: number }>(
      `select count(*)::int as n from barriers where deleted_at is null`,
    ),
  ]);
  const latest = finished[0] ?? null;
  const staleRow = stale[0] ?? null;
  const staleRunning = isStaleActive(staleRow, latest);
  const run = running[0] ?? null;
  return toSyncStatus({
    latest: latest === null ? null : {
      ...latest,
      started_at: asIsoString(latest.started_at),
      finished_at: asIsoString(latest.finished_at),
    },
    running: run === null ? null : {
      scope: run.scope,
      started_at: asIsoString(run.started_at),
    },
    staleRunning,
    barriers: counted[0]?.n ?? 0,
  });
}

function asIsoString(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
