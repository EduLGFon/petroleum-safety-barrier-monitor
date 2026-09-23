// Sync SQL repository - the real default SyncIo for lib/server/fracttal/sync.
// This is why it exists: reconcile plans are pure, but applying them touches
// barriers + history + sync_state. Every write is idempotent (UNIQUE
// external_code + where guards), status changes go through the one sanctioned
// record_status_change() path, and deletions are soft (deleted_at).
import {
  fieldsSignature,
  type LocalBarrier,
  type PlanCounts,
  type PlanEntry,
  type SyncIo,
} from "../fracttal/sync.ts";

import type { MapContext } from "../fracttal/map.ts";

import type { SyncChange, SyncStatus } from "../../types.ts";

import { queryRows } from "../db.ts";

export const SYNC_AUTHOR_ID = 10; // authors.id, see db/seed_lookups.sql

// Freshness windows for the status indicator, in minutes. A `running` row
// newer than SYNC_FRESH_MINUTES means a sync is in flight; one older than
// SYNC_STALE_MINUTES means the poller likely crashed mid-run.
export const SYNC_FRESH_MINUTES = 10;
export const SYNC_STALE_MINUTES = 15;

// syncScopeRunning: poll lock - true while a run for the scope is still
// 'running'. A crashed run would block polls forever, so the lock is stale
// once started_at is older than staleMinutes.
export async function syncScopeRunning(
  scope: string,
  staleMinutes = 10,
): Promise<boolean> {
  const rows = await queryRows<{ one: number }>(
    `select 1 as one
     from sync_state
     where scope = $1 and status = 'running'
       and started_at >= now() - make_interval(mins => $2)
     limit 1`,
    [scope, staleMinutes],
  );
  return rows.length > 0;
}

// defaultSyncIo: the wiring runSync uses when no custom io is injected.
export const defaultSyncIo: SyncIo = {
  async buildMapContext(): Promise<MapContext> {
    const [locRows, catRows, critRows] = await Promise.all([
      queryRows<{ id: number; code: string }>(
        `select id, code from locations`,
      ),
      queryRows<{ id: number; label: string }>(
        `select id, label from categories`,
      ),
      queryRows<{ id: number; label: string }>(
        `select id, label from criticality_levels`,
      ),
    ]);
    const ctx: MapContext = {
      locationIds: Object.fromEntries(
        locRows.map((r) => [r.code.toUpperCase(), r.id]),
      ),
      categoryIds: Object.fromEntries(catRows.map((r) => [r.label, r.id])),
      criticalityIds: Object.fromEntries(critRows.map((r) => [r.label, r.id])),
    };
    return ctx;
  },

  async loadLocal(
    scopeLocationIds: number[],
    remoteCodes: string[],
  ): Promise<LocalBarrier[]> {
    if (scopeLocationIds.length === 0 && remoteCodes.length === 0) return [];
    const rows = await queryRows<{
      id: number;
      external_code: string;
      location_id: number;
      availability_id: number;
      deleted_at: string | null;
      tag: string;
      typology_id: number;
      loc_desc_id: number;
      criticality_id: number;
      category_id: number;
      grouping_id: number;
      owner_id: number | null;
      comments: string;
      action_plan: string;
    }>(
      `select id, external_code, location_id, availability_id, deleted_at,
         tag, typology_id, loc_desc_id, criticality_id, category_id,
         grouping_id, owner_id, comments, action_plan
        from barriers
        where external_code is not null
          and (location_id = any($1) or external_code = any($2))
        order by id`,
      [scopeLocationIds, remoteCodes],
    );
    return rows.map((r) => ({
      id: r.id,
      externalCode: r.external_code,
      availabilityId: r.availability_id,
      deletedAt: r.deleted_at,
      signature: fieldsSignature({
        tag: r.tag,
        locationId: r.location_id,
        typologyId: r.typology_id,
        locDescId: r.loc_desc_id,
        criticalityId: r.criticality_id,
        categoryId: r.category_id,
        groupingId: r.grouping_id,
        ownerId: r.owner_id,
        comments: r.comments,
        actionPlan: r.action_plan,
      }),
    }));
  },

  async startRun(scope: string): Promise<number> {
    const rows = await queryRows<{ id: number }>(
      `insert into sync_state (scope, status, started_at, finished_at)
       values ($1, 'running', now(), now())
       returning id`,
      [scope],
    );
    const started = rows[0];
    if (!started) throw new Error("startRun returned no row");
    return started.id;
  },

  async applyPlan(entries: PlanEntry[]): Promise<PlanCounts> {
    const counts: PlanCounts = { inserts: 0, updates: 0, deletes: 0, skips: 0 };
    for (const entry of entries) {
      if (entry.kind === "skip") {
        counts.skips++;
        continue;
      }
      if (entry.kind === "delete") {
        await queryRows(
          `update barriers set deleted_at = now()
           where id = $1 and deleted_at is null`,
          [entry.local.id],
        );
        counts.deletes++;
        continue;
      }
      const input = entry.input;
      if (entry.kind === "insert") {
        const id = await insertBarrier(input);
        if (id !== null) {
          // Stamp the initial history row so the transition timeline is not
          // empty for a freshly imported barrier.
          await queryRows(
            "select record_status_change($1, $2, $3, $4)",
            [
              id,
              input.availabilityId,
              SYNC_AUTHOR_ID,
              "Importado do Fracttal",
            ],
          );
          counts.inserts++;
        } else {
          // Race: the unique external_code constraint won - another run
          // inserted this row first. Count as a skip, not an error.
          counts.skips++;
        }
        continue;
      }
      // update / restore: same field write (location included, so station
      // moves persist); restore clears deleted_at.
      await queryRows(
        `update barriers set
           tag = $2, location_id = $3, typology_id = $4, loc_desc_id = $5,
           criticality_id = $6, category_id = $7, grouping_id = $8,
           owner_id = $9, comments = $10, action_plan = $11,
           source_updated_at = $12,
           deleted_at = case when $13 then null else deleted_at end
         where id = $1`,
        [
          entry.local.id,
          input.tag,
          input.locationId,
          input.typologyId,
          input.locDescId,
          input.criticalityId,
          input.categoryId,
          input.groupingId,
          input.ownerId,
          input.comments,
          input.actionPlan,
          input.sourceUpdatedAt,
          entry.kind === "restore",
        ],
      );
      if (entry.statusChanged) {
        await queryRows(
          "select record_status_change($1, $2, $3, $4)",
          [
            entry.local.id,
            input.availabilityId,
            SYNC_AUTHOR_ID,
            "Sincronização Fracttal",
          ],
        );
      }
      counts.updates++;
    }
    return counts;
  },

  async finishRun(
    runId: number,
    status: "ok" | "failed",
    counts: PlanCounts,
    note: string,
  ): Promise<void> {
    await queryRows(
      `update sync_state
       set status = $2, inserts = $3, updates = $4, deletes = $5,
           skips = $6, note = $7, finished_at = now()
       where id = $1`,
      [
        runId,
        status,
        counts.inserts,
        counts.updates,
        counts.deletes,
        counts.skips,
        note,
      ],
    );
  },
};

// insertBarrier: the create path, guarded by the UNIQUE external_code
// constraint (dedup is DB-enforced, not app logic). Returns the new id when
// the row was actually inserted, null on a race-conflict.
async function insertBarrier(input: {
  externalCode: string;
  tag: string;
  locationId: number;
  typologyId: number;
  locDescId: number;
  criticalityId: number;
  categoryId: number;
  groupingId: number;
  ownerId: number | null;
  availabilityId: number;
  comments: string;
  actionPlan: string;
  sourceUpdatedAt: string | null;
}): Promise<number | null> {
  const rows = await queryRows<{ id: number }>(
    `insert into barriers
       (external_code, tag, location_id, typology_id, loc_desc_id,
        criticality_id, category_id, grouping_id, owner_id,
        availability_id, comments, action_plan, status_since,
        source_updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, current_date, $13)
     on conflict (external_code) do nothing
     returning id`,
    [
      input.externalCode,
      input.tag,
      input.locationId,
      input.typologyId,
      input.locDescId,
      input.criticalityId,
      input.categoryId,
      input.groupingId,
      input.ownerId,
      input.availabilityId,
      input.comments,
      input.actionPlan,
      input.sourceUpdatedAt,
    ],
  );
  return rows[0]?.id ?? null;
}

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

// toSyncStatus: pure state decision over the three reads below. A fresh
// `running` row means in flight; a stale one (no fresh row) means the
// poller likely died mid-run; otherwise the latest finished row decides,
// and an empty table reports unknown. Unexpected statuses fail closed.
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

// getSyncStatus: dashboard indicator data - latest finished run, fresh
// running row, stale-run flag, and the tracked barrier total. Read-only;
// the route serves it to any authenticated dashboard user.
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
         and started_at >= now() - make_interval(mins => $1)
       order by id desc limit 1`,
      [SYNC_FRESH_MINUTES],
    ),
    queryRows<{ one: number }>(
      `select 1 as one from sync_state
       where status = 'running'
         and started_at < now() - make_interval(mins => $1)
       limit 1`,
      [SYNC_STALE_MINUTES],
    ),
    queryRows<{ n: number }>(
      `select count(*)::int as n from barriers where deleted_at is null`,
    ),
  ]);
  return toSyncStatus({
    latest: finished[0] ?? null,
    running: running[0] ?? null,
    staleRunning: stale.length > 0,
    barriers: counted[0]?.n ?? 0,
  });
}

// HistoryTouch: raw join shape for the recent-changes list below.
interface HistoryTouch {
  barrier_id: number;
  tag: string;
  location: string;
  status: string;
  note: string;
  changed_at: string;
}

// getSyncRecentChanges: newest barriers touched by the sync author (history
// rows stamped by applyPlan) plus recent soft deletes, merged by timestamp.
// Read-only; powers the card's "what changed" section so raw counts are
// never the whole story. Limit is clamped to 1..20.
export async function getSyncRecentChanges(limit = 8): Promise<SyncChange[]> {
  const take = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const [touched, removed] = await Promise.all([
    queryRows<HistoryTouch>(
      `select b.id as barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location,
        coalesce(s.label, '') as status, h.note,
        h.created_at as changed_at
       from barrier_status_history h
       join barriers b on b.id = h.barrier_id
       left join locations l on l.id = b.location_id
       left join availability_statuses s on s.id = h.status_id
       where h.author_id = $1
       order by h.created_at desc limit $2`,
      [SYNC_AUTHOR_ID, take],
    ),
    queryRows<
      Pick<HistoryTouch, "barrier_id" | "tag" | "location" | "changed_at">
    >(
      `select b.id as barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location,
        b.deleted_at as changed_at
       from barriers b
       left join locations l on l.id = b.location_id
       where b.deleted_at is not null
       order by b.deleted_at desc limit $1`,
      [take],
    ),
  ]);
  const merged: SyncChange[] = [
    ...touched.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (r.note === "Importado do Fracttal" ? "new" : "updated") as
        | "new"
        | "updated",
      status: r.status,
      changedAt: r.changed_at,
    })),
    ...removed.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: "removed" as const,
      status: "Removida",
      changedAt: r.changed_at,
    })),
  ];
  merged.sort((a, b) =>
    new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );
  return merged.slice(0, take);
}

// recordSyncFailure: persists a failure that happened outside any run
// (cycle-level shared fetch, boot checks). Without it, pre-run failures
// leave zero trace and the dashboard shows an ever-aging success as merely
// "idle" - indistinguishable from a healthy quiet period.
export async function recordSyncFailure(
  scope: string,
  note: string,
): Promise<void> {
  await queryRows(
    `insert into sync_state (scope, status, started_at, finished_at, note)
     values ($1, 'failed', now(), now(), $2)`,
    [scope, note.slice(0, 2000)],
  );
}
