// Sync SQL repository - the real default SyncIo for lib/server/fracttal/sync.
// This is why it exists: reconcile plans are pure, but applying them touches
// barriers + history + sync_state. Every write is idempotent (UNIQUE
// external_code + where guards), status changes go through the one sanctioned
// record_status_change() path, and deletions are soft (deleted_at).
import {
  diffSignatureFields,
  fieldsSignature,
  type LocalBarrier,
  type PlanCounts,
  type PlanEntry,
  ScopeBusyError,
  type SignatureSource,
  snapshotOf,
  type SyncIo,
} from "../fracttal/sync.ts";

import type {
  SyncBarrierDetail,
  SyncChange,
  SyncChangeItem,
  SyncChangeSummary,
  SyncRun,
  SyncStatus,
} from "../../types.ts";

import type { CatalogNeeds, MapContext } from "../fracttal/map.ts";

import { queryRows, type TxQuery, withTx } from "../db.ts";

import { getResolverLabels } from "./vocabularies.ts";

import {
  fromAvailabilityId,
  fromCategoryId,
  fromCriticalityId,
  fromGroupingId,
  fromLocationId,
  fromLocDescId,
  fromOwnerId,
  fromTypologyId,
} from "../../enums.ts";

export const SYNC_AUTHOR_ID = 10; // authors.id, see db/seed_lookups.sql

// Freshness windows for the status indicator, in minutes. A `running` row
// newer than SYNC_FRESH_MINUTES means a sync is in flight; one older than
// SYNC_STALE_MINUTES means the poller likely crashed mid-run.
export const SYNC_FRESH_MINUTES = 10;
export const SYNC_STALE_MINUTES = 15;

// Apply chunk: barriers committed per transaction. Bounds tx length and
// the audit batch (8 params per row) well under protocol limits.
export const SYNC_APPLY_CHUNK = 200;

// syncScopeRunning: poll lock - true while a run for the scope is still
// 'running'. A crashed run would block polls forever, so the lock is stale
// once the lease lapses. Liveness rides finished_at (rewritten as a
// heartbeat while a run is alive), never started_at, so a slow-but-alive
// sweep cannot expire its own lock mid-run.
export async function syncScopeRunning(
  scope: string,
  staleMinutes = 10,
): Promise<boolean> {
  const rows = await queryRows<{ one: number }>(
    `select 1 as one
     from sync_state
     where scope = $1 and status = 'running'
       and finished_at >= now() - make_interval(mins => $2)
     limit 1`,
    [scope, staleMinutes],
  );
  return rows.length > 0;
}

// reapStaleRuns: self-healing for orphaned `running` rows (process killed
// between startRun and finishRun, e.g. SIGKILL / redeploy mid-sweep).
// Marks them `failed` so they stop latching the dashboard `stale` state
// forever. Best-effort: a failure here never blocks the new run. Only rows
// whose heartbeat lapsed qualify, so a slow-but-alive run (heartbeating
// finished_at forward) is never reaped from under itself.
export async function reapStaleRuns(
  scope: string,
  staleMinutes = SYNC_STALE_MINUTES,
): Promise<number> {
  const rows = await queryRows<{ n: number }>(
    `with reaped as (
       update sync_state
       set status = 'failed',
           finished_at = now(),
           note = 'reaped: orphaned running row (superseded, never finished)'
       where scope = $1 and status = 'running'
         and finished_at < now() - make_interval(mins => $2)
       returning 1
     ) select count(*)::int as n from reaped`,
    [scope, staleMinutes],
  );
  const n = rows[0]?.n ?? 0;
  if (n > 0) {
    console.log(`[sync] reaped ${n} stale running row(s) scope=${scope}`);
  }
  return n;
}

// touchSyncRun: refresh the running lease (finished_at doubles as the
// heartbeat). Best-effort: callers swallow errors so a lost heartbeat never
// fails the run; the row guard keeps a finished run from being touched.
export async function touchSyncRun(runId: number): Promise<void> {
  try {
    await queryRows(
      `update sync_state set finished_at = now()
       where id = $1 and status = 'running'`,
      [runId],
    );
  } catch (err) {
    console.warn("sync: best-effort heartbeat failed", err);
  }
}

// defaultSyncIo: the wiring runSync uses when no custom io is injected.
export const defaultSyncIo: SyncIo = {
  // ensureCatalog: insert the sweep's missing categories + locations so
  // mapping resolves the whole tenant, not just the seeded/imported
  // snapshot. Ids continue past max(id) (never renumbering live rows);
  // ON CONFLICT DO NOTHING keeps reruns and racing cycles idempotent.
  // Display names are write-once (first non-null wins, mirroring the
  // import): an operator hand-edit to a name is never overwritten here.
  async ensureCatalog(needs: CatalogNeeds): Promise<void> {
    if (needs.categories.length > 0) {
      const have = await queryRows<{ id: number }>(
        `select id from categories`,
      );
      let next = have.reduce((m, r) => Math.max(m, r.id), -1) + 1;
      for (let i = 0; i < needs.categories.length; i += 500) {
        const chunk = needs.categories.slice(i, i + 500);
        const placeholders = chunk
          .map((_, k) => `($${2 * k + 1}, $${2 * k + 2})`)
          .join(", ");
        const args: unknown[] = [];
        for (const label of chunk) args.push(next++, label);
        await queryRows(
          `insert into categories (id, label) values ${placeholders} ` +
            `on conflict (label) do nothing`,
          args,
        );
      }
    }
    if (needs.locations.length > 0) {
      const have = await queryRows<{ id: number }>(
        `select id from locations`,
      );
      let next = have.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      for (let i = 0; i < needs.locations.length; i += 200) {
        const chunk = needs.locations.slice(i, i + 200);
        const placeholders = chunk
          .map((_, k) =>
            `($${4 * k + 1}, $${4 * k + 2}, $${4 * k + 3}, $${4 * k + 4})`
          )
          .join(", ");
        const args: unknown[] = [];
        for (const loc of chunk) {
          args.push(next++, loc.code, loc.type, loc.name);
        }
        await queryRows(
          `insert into locations (id, code, type, name) values ${placeholders} ` +
            `on conflict (code) do nothing`,
          args,
        );
      }
    }
  },
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
      is_active: boolean | null;
      tag: string;
      typology_id: number;
      loc_desc_id: number;
      criticality_id: number;
      category_id: number;
      grouping_id: number;
      owner_id: number | null;
      comments: string;
      action_plan: string;
      scope_source: string | null;
    }>(
      `select id, external_code, location_id, availability_id, deleted_at,
         is_active,
         tag, typology_id, loc_desc_id, criticality_id, category_id,
         grouping_id, owner_id, comments, action_plan,
         coalesce(scope_source, '') as scope_source
        from barriers
        where external_code is not null
          and (location_id = any($1) or external_code = any($2))
        order by id`,
      [scopeLocationIds, remoteCodes],
    );
    return rows.map((r) => {
      const fields: SignatureSource = {
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
        // Pre-migration rows read null; treat as enabled (the old default).
        isActive: r.is_active ?? true,
        scopeSource: r.scope_source ?? "",
      };
      return {
        id: r.id,
        externalCode: r.external_code,
        availabilityId: r.availability_id,
        deletedAt: r.deleted_at,
        signature: fieldsSignature(fields),
        fields,
      };
    });
  },

  async startRun(scope: string): Promise<number> {
    // Self-heal before opening a new run: a previous process may have died
    // between startRun and finishRun, leaving a `running` row that would
    // otherwise latch the dashboard `stale` state forever even as fresh
    // `ok` runs keep landing. Reaping is scoped + best-effort.
    try {
      await reapStaleRuns(scope);
    } catch (err) {
      // A reaping failure must never block the new run; the stale flag
      // below already ignores superseded orphans as a second defense.
      console.warn("sync: best-effort reapStaleRuns failed", err);
    }
    // Atomic claim: the INSERT only fires when no fresh lease exists, so
    // two processes racing past the pollOnce lock cannot both open a run.
    // The loser gets ScopeBusyError (mapped to `skipped`, never a failure).
    const rows = await queryRows<{ id: number }>(
      `insert into sync_state (scope, status, started_at, finished_at)
       select $1, 'running', now(), now()
       where not exists (
         select 1 from sync_state
         where scope = $1 and status = 'running'
           and finished_at >= now() - make_interval(mins => $2)
       )
       returning id`,
      [scope, SYNC_FRESH_MINUTES],
    );
    const started = rows[0];
    if (!started) {
      throw new ScopeBusyError(`[sync] scope ${scope} already running`);
    }
    console.log(`[sync] start scope=${scope} runId=${started.id}`);
    return started.id;
  },

  // heartbeat: refresh the running lease so the reaper and the lock see
  // this run as alive. Best-effort: a lost heartbeat only risks a false
  // reap on very slow runs, never fails the run itself.
  async heartbeat(runId: number): Promise<void> {
    await touchSyncRun(runId);
  },

  async applyPlan(
    entries: PlanEntry[],
    runId?: number | null,
  ): Promise<PlanCounts> {
    const counts: PlanCounts = { inserts: 0, updates: 0, deletes: 0, skips: 0 };
    const rid = runId ?? null;
    // Chunked transactions: a crash leaves whole chunks applied or not,
    // never half a chunk. Audit rows batch after each commit (best-effort,
    // same as before) so a missing audit table never fails barrier writes.
    for (let at = 0; at < entries.length; at += SYNC_APPLY_CHUNK) {
      const audits: AuditRow[] = [];
      await withTx(async (tx) => {
        for (const entry of entries.slice(at, at + SYNC_APPLY_CHUNK)) {
          if (entry.kind === "skip") {
            counts.skips++;
            continue;
          }
          if (entry.kind === "delete") {
            await tx(
              `update barriers set deleted_at = now()
               where id = $1 and deleted_at is null`,
              [entry.local.id],
            );
            counts.deletes++;
            audits.push({
              barrierId: entry.local.id,
              kind: "removed",
              oldAvailabilityId: entry.local.availabilityId,
              newAvailabilityId: null,
              changedFields: [],
              oldSnapshot: entry.local.fields
                ? snapshotOf(entry.local.fields, entry.local.availabilityId)
                : { availabilityId: entry.local.availabilityId },
              newSnapshot: {},
            });
            continue;
          }
          const input = entry.input;
          if (entry.kind === "insert") {
            const id = await insertBarrier(input, tx);
            if (id !== null) {
              // Stamp the initial history row so the transition timeline is
              // not empty for a freshly imported barrier.
              await tx(
                "select record_status_change($1, $2, $3, $4)",
                [
                  id,
                  input.availabilityId,
                  SYNC_AUTHOR_ID,
                  "Importado do Fracttal",
                ],
              );
              counts.inserts++;
              audits.push({
                barrierId: id,
                kind: "new",
                oldAvailabilityId: null,
                newAvailabilityId: input.availabilityId,
                changedFields: [],
                oldSnapshot: {},
                newSnapshot: snapshotOf(input, input.availabilityId),
              });
            } else {
              // Race: the unique external_code constraint won - another run
              // inserted this row first. Count as a skip, not an error.
              counts.skips++;
            }
            continue;
          }
          // update / restore: same field write (location included, so
          // station moves persist); restore clears deleted_at.
          await tx(
            `update barriers set
               tag = $2, location_id = $3, typology_id = $4, loc_desc_id = $5,
               criticality_id = $6, category_id = $7, grouping_id = $8,
               owner_id = $9, comments = $10, action_plan = $11,
               source_updated_at = $12, scope_source = $13, is_active = $14,
               deleted_at = case when $15 then null else deleted_at end
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
              input.scopeSource,
              input.isActive,
              entry.kind === "restore",
            ],
          );
          if (entry.statusChanged) {
            await tx(
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
          audits.push({
            barrierId: entry.local.id,
            kind: entry.kind === "restore" ? "restored" : "updated",
            oldAvailabilityId: entry.local.availabilityId,
            newAvailabilityId: input.availabilityId,
            changedFields: diffSignatureFields(
              entry.local.fields,
              input,
              entry.statusChanged,
            ),
            oldSnapshot: entry.local.fields
              ? snapshotOf(entry.local.fields, entry.local.availabilityId)
              : { availabilityId: entry.local.availabilityId },
            newSnapshot: snapshotOf(input, input.availabilityId),
          });
        }
      });
      await insertAuditBatch(rid, audits);
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
    // Finish line mirrors the audit row (counts plus the note head) so a
    // cycle is traceable in stderr alone when the DB is unreachable later.
    console.log(
      `[sync] finish runId=${runId} status=${status} ` +
        `i=${counts.inserts} u=${counts.updates} d=${counts.deletes} ` +
        `s=${counts.skips} note=${note.slice(0, 120)}`,
    );
  },
};

// insertBarrier: the create path, guarded by the UNIQUE external_code
// constraint (dedup is DB-enforced, not app logic). Returns the new id when
// the row was actually inserted, null on a race-conflict. Runs on the
// given query (transaction connection in applyPlan, pool otherwise).
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
  scopeSource: string;
  isActive: boolean;
  comments: string;
  actionPlan: string;
  sourceUpdatedAt: string | null;
}, query: TxQuery = queryRows): Promise<number | null> {
  const rows = await query<{ id: number }>(
    `insert into barriers
       (external_code, tag, location_id, typology_id, loc_desc_id,
        criticality_id, category_id, grouping_id, owner_id,
        availability_id, comments, action_plan, status_since,
        source_updated_at, scope_source, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, current_date, $13, $14, $15)
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
      input.scopeSource,
      input.isActive,
    ],
  );
  return rows[0]?.id ?? null;
}

// AuditRow: one sync_barrier_changes row per touched barrier.
interface AuditRow {
  barrierId: number;
  kind: string;
  oldAvailabilityId: number | null;
  newAvailabilityId: number | null;
  changedFields: string[];
  oldSnapshot: Record<string, unknown>;
  newSnapshot: Record<string, unknown>;
}

// insertAuditBatch: one multi-row INSERT per apply chunk instead of one
// statement per barrier. Best-effort like recordBarrierChange: empty
// batches and null runs skip, a missing table warns, and a rejected batch
// falls back to per-row inserts so one bad row never drops the rest.
async function insertAuditBatch(
  runId: number | null,
  audits: AuditRow[],
): Promise<void> {
  if (runId === null || runId === undefined || audits.length === 0) return;
  const values: string[] = [];
  const args: unknown[] = [];
  for (const a of audits) {
    args.push(
      runId,
      a.barrierId,
      a.kind,
      a.oldAvailabilityId,
      a.newAvailabilityId,
      JSON.stringify(a.changedFields),
      JSON.stringify(a.oldSnapshot),
      JSON.stringify(a.newSnapshot),
    );
    const b = args.length - 8;
    values.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, ` +
        `$${b + 6}::jsonb, $${b + 7}::jsonb, $${b + 8}::jsonb)`,
    );
  }
  try {
    await queryRows(
      `insert into sync_barrier_changes
        (run_id, barrier_id, kind, old_availability_id, new_availability_id,
         changed_fields, old_snapshot, new_snapshot)
       values ${values.join(", ")}`,
      args,
    );
  } catch (err) {
    console.warn("[sync] audit batch failed, retrying per row", err);
    for (const a of audits) {
      await recordBarrierChange(runId, {
        barrierId: a.barrierId,
        kind: a.kind,
        oldAvailabilityId: a.oldAvailabilityId,
        newAvailabilityId: a.newAvailabilityId,
        changedFields: a.changedFields,
        oldSnapshot: a.oldSnapshot,
        newSnapshot: a.newSnapshot,
      });
    }
  }
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

// isStaleActive: pure guard so superseded orphans never latch `stale`.
// A stale `running` candidate only counts when it is newer than the
// latest finished run (id is monotonic; timestamp is the cross-scope
// fallback). An older orphan means healthy runs kept landing after the
// crash - the indicator must report idle, not stuck.
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
//
// Stale defense in depth: a `running` row whose heartbeat lapsed past
// SYNC_STALE_MINUTES only counts when it is NEWER than the latest finished
// run. An orphan left by a killed process (superseded by later `ok` rows)
// is ignored here and reaped on the next startRun, instead of latching
// `stale` forever while healthy runs keep landing.
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
  // A stale candidate superseded by a newer finished run is an orphan,
  // not an in-flight stuck sync (see isStaleActive).
  const staleRunning = isStaleActive(staleRow, latest);
  // The driver returns timestamptz as Date; the SyncStatus contract is ISO
  // strings (wire JSON serializes Dates identically, so this changes only
  // the in-process shape, never the bytes).
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

// asIsoString: normalizes a driver timestamp (Date) or string to the ISO
// form the SyncStatus/SyncRun contracts declare.
function asIsoString(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
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

// recordBarrierChange: one audit row per touched barrier. Best-effort: a
// missing table (pre-migration DB) or a null runId skips silently so sync
// writes never fail because the audit trail is unavailable.
export async function recordBarrierChange(
  runId: number | null,
  change: {
    barrierId: number;
    kind: string;
    oldAvailabilityId: number | null;
    newAvailabilityId: number | null;
    changedFields: string[];
    oldSnapshot: Record<string, unknown>;
    newSnapshot: Record<string, unknown>;
  },
): Promise<void> {
  if (runId === null || runId === undefined) return;
  try {
    await queryRows(
      `insert into sync_barrier_changes
        (run_id, barrier_id, kind, old_availability_id, new_availability_id,
         changed_fields, old_snapshot, new_snapshot)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
      [
        runId,
        change.barrierId,
        change.kind,
        change.oldAvailabilityId,
        change.newAvailabilityId,
        JSON.stringify(change.changedFields),
        JSON.stringify(change.oldSnapshot),
        JSON.stringify(change.newSnapshot),
      ],
    );
  } catch (err) {
    // Pre-migration databases have no sync_barrier_changes table yet; the
    // barrier write above already committed, so only warn.
    console.warn("[sync] recordBarrierChange skipped", err);
  }
}

// getLatestFinishedRun: newest non-running sync_state row, or null.
export async function getLatestFinishedRun(): Promise<SyncRun | null> {
  const rows = await queryRows<SyncStatusRow>(
    `select id, scope, status, inserts, updates, deletes, skips, note,
      started_at, finished_at
     from sync_state where status != 'running'
     order by id desc limit 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    scope: r.scope,
    status: r.status === "ok" ? "ok" : "failed",
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    inserts: r.inserts,
    updates: r.updates,
    deletes: r.deletes,
    skips: r.skips,
  };
}

// getSyncRuns: recent finished runs for the run picker (newest first).
export async function getSyncRuns(limit = 10): Promise<SyncRun[]> {
  const take = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  const rows = await queryRows<SyncStatusRow>(
    `select id, scope, status, inserts, updates, deletes, skips, note,
      started_at, finished_at
     from sync_state where status != 'running'
     order by id desc limit $1`,
    [take],
  );
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    status: r.status === "ok" ? "ok" : "failed",
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    inserts: r.inserts,
    updates: r.updates,
    deletes: r.deletes,
    skips: r.skips,
  }));
}

export interface ListSyncChangesArgs {
  runId?: number | null;
  sinceHours?: number | null;
  kind?: string | null;
  query?: string | null;
  page?: number;
  pageSize?: number;
}

export interface ListSyncChangesResult {
  run: SyncRun | null;
  items: SyncChangeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: SyncChangeSummary;
}

// listSyncChanges: paged per-barrier change list for one scope. Prefers the
// sync_barrier_changes audit when present; falls back to history + deletes
// for pre-migration runs so old runs still list something (without field
// diffs). Light rows only - snapshots load per barrier via detail.
export async function listSyncChanges(
  args: ListSyncChangesArgs = {},
): Promise<ListSyncChangesResult> {
  const page = Math.max(1, Math.floor(args.page ?? 1) || 1);
  const pageSize = Math.max(
    1,
    Math.min(100, Math.floor(args.pageSize ?? 25) || 25),
  );
  const offset = (page - 1) * pageSize;
  const kind = (args.query === undefined ? args.kind : args.kind) ?? null;
  const q = (args.query ?? "").trim().slice(0, 200);

  let run: SyncRun | null = null;
  let sinceIso: string | null = null;
  if (args.runId !== undefined && args.runId !== null) {
    const rows = await queryRows<SyncStatusRow>(
      `select id, scope, status, inserts, updates, deletes, skips, note,
        started_at, finished_at from sync_state where id = $1 limit 1`,
      [args.runId],
    );
    const r = rows[0];
    if (r) {
      run = {
        id: r.id,
        scope: r.scope,
        status: r.status === "ok" ? "ok" : "failed",
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        inserts: r.inserts,
        updates: r.updates,
        deletes: r.deletes,
        skips: r.skips,
      };
    }
  } else if (args.sinceHours !== undefined && args.sinceHours !== null) {
    const h = Math.max(1, Math.min(72, args.sinceHours));
    sinceIso = new Date(Date.now() - h * 3600_000).toISOString();
  } else {
    run = await getLatestFinishedRun();
  }

  // Primary path: audit table rows for the run, or last-N-hours window.
  try {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (run) {
      params.push(run.id);
      conds.push(`c.run_id = $${params.length}`);
    } else if (sinceIso) {
      params.push(sinceIso);
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    } else {
      return emptyChangeResult(page, pageSize, null);
    }
    if (kind && kind !== "all") {
      if (kind === "new") {
        params.push("new");
        conds.push(`c.kind = $${params.length}`);
      } else if (kind === "updated") {
        params.push(["updated", "restored"]);
        conds.push(`c.kind = any($${params.length})`);
      } else if (kind === "removed") {
        params.push("removed");
        conds.push(`c.kind = $${params.length}`);
      } else if (kind === "restored") {
        params.push("restored");
        conds.push(`c.kind = $${params.length}`);
      }
    }
    if (q !== "") {
      params.push(`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      conds.push(`b.tag ilike $${params.length} escape '\\'`);
    }
    const where = conds.length > 0 ? `where ${conds.join(" and ")}` : "";
    // Single round-trip: the total rides along as count(*) OVER() so the
    // page and the count share one filtered scan. Out-of-range pages take
    // one cheap count query so totalPages stays exact.
    const rows = await queryRows<{
      barrier_id: number;
      tag: string;
      location: string;
      kind: string;
      old_availability_id: number | null;
      new_availability_id: number | null;
      old_status: string | null;
      new_status: string | null;
      changed_fields: unknown;
      created_at: string;
      run_id: number;
      criticality_id: number | null;
      full_count: string;
    }>(
      `select c.barrier_id, b.tag,
        coalesce(l.name, l.code, '') as location, c.kind,
        c.old_availability_id, c.new_availability_id,
        os.label as old_status, ns.label as new_status,
        c.changed_fields, c.created_at, c.run_id, b.criticality_id,
        count(*) over () as full_count
       from sync_barrier_changes c
       join barriers b on b.id = c.barrier_id
       left join locations l on l.id = b.location_id
       left join availability_statuses os on os.id = c.old_availability_id
       left join availability_statuses ns on ns.id = c.new_availability_id
       ${where} order by c.created_at desc, c.id desc
       limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    // The page-to-barrier joins are all to-one, so the window total matches
    // the old standalone count exactly.
    let total = rows.length > 0 ? Number(rows[0]?.full_count ?? 0) : 0;
    if (rows.length === 0 && offset > 0) {
      const countRows = await queryRows<{ n: number }>(
        `select count(*)::int as n from sync_barrier_changes c
         join barriers b on b.id = c.barrier_id ${where}`,
        params,
      );
      total = countRows[0]?.n ?? 0;
    }
    const items: SyncChangeItem[] = rows.map((r) => ({
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (r.kind === "new"
        ? "new"
        : r.kind === "removed"
        ? "removed"
        : "updated") as "new" | "updated" | "removed",
      status: r.new_status ?? r.old_status ?? "",
      oldStatus: r.old_status,
      changedFields: Array.isArray(r.changed_fields)
        ? (r.changed_fields as string[])
        : [],
      changedAt: r.created_at,
      runId: r.run_id,
    }));
    const summary = await summarizeAuditRows(run?.id ?? null, sinceIso);
    return {
      run,
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary,
    };
  } catch {
    // Missing table (pre-migration): fall back to history-derived list.
    return listSyncChangesLegacy({
      run,
      sinceIso,
      kind,
      query: q,
      page,
      pageSize,
    });
  }
}

function emptyChangeResult(
  page: number,
  pageSize: number,
  run: SyncRun | null,
): ListSyncChangesResult {
  return {
    run,
    items: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    summary: { total: 0, byKind: {}, byStatus: {}, critical: 0 },
  };
}

async function summarizeAuditRows(
  runId: number | null,
  sinceIso: string | null,
): Promise<SyncChangeSummary> {
  try {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (runId !== null) {
      params.push(runId);
      conds.push(`c.run_id = $${params.length}`);
    } else if (sinceIso) {
      params.push(sinceIso);
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    } else {
      return { total: 0, byKind: {}, byStatus: {}, critical: 0 };
    }
    const where = `where ${conds.join(" and ")}`;
    const [kindRows, statusRows, critRows] = await Promise.all([
      queryRows<{ kind: string; n: number }>(
        `select c.kind, count(*)::int as n from sync_barrier_changes c ${where} group by c.kind`,
        params,
      ),
      queryRows<{ label: string; n: number }>(
        `select coalesce(ns.label, 'Removida') as label, count(*)::int as n
         from sync_barrier_changes c
         left join barriers b on b.id = c.barrier_id
         left join availability_statuses ns on ns.id = c.new_availability_id
         ${where} group by coalesce(ns.label, 'Removida')`,
        params,
      ),
      queryRows<{ n: number }>(
        `select count(*)::int as n from sync_barrier_changes c
         join barriers b on b.id = c.barrier_id ${where}
         and b.criticality_id in (0, 1)`,
        params,
      ),
    ]);
    const byKind: Record<string, number> = {};
    let total = 0;
    for (const r of kindRows) {
      byKind[r.kind] = r.n;
      total += r.n;
    }
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.label] = r.n;
    return { total, byKind, byStatus, critical: critRows[0]?.n ?? 0 };
  } catch {
    return { total: 0, byKind: {}, byStatus: {}, critical: 0 };
  }
}

// listSyncChangesLegacy: history-derived fallback for pre-migration runs.
// No changed_fields; status-only items, paged in memory (small windows).
async function listSyncChangesLegacy(args: {
  run: SyncRun | null;
  sinceIso: string | null;
  kind: string | null;
  query: string;
  page: number;
  pageSize: number;
}): Promise<ListSyncChangesResult> {
  const take = 200;
  let items: SyncChangeItem[] = [];
  if (args.run && !args.sinceIso) {
    const recent = await getSyncRecentChanges(take);
    const start = new Date(args.run.startedAt).getTime();
    const end = new Date(args.run.finishedAt).getTime() + 60_000;
    items = recent
      .filter((c) => {
        const t = new Date(c.changedAt).getTime();
        return t >= start && t <= end;
      })
      .map((c) => ({
        ...c,
        oldStatus: null,
        changedFields: [],
        runId: args.run!.id,
      }));
  } else if (args.sinceIso) {
    const recent = await getSyncRecentChanges(take);
    const since = new Date(args.sinceIso).getTime();
    items = recent
      .filter((c) => new Date(c.changedAt).getTime() >= since)
      .map((c) => ({ ...c, oldStatus: null, changedFields: [], runId: null }));
  }
  if (args.kind && args.kind !== "all") {
    items = items.filter((c) =>
      args.kind === "updated"
        ? c.kind === "updated"
        : c.kind === (args.kind as "new" | "updated" | "removed")
    );
  }
  if (args.query !== "") {
    const needle = args.query.toLowerCase();
    items = items.filter((c) => c.tag.toLowerCase().includes(needle));
  }
  const total = items.length;
  const start = (args.page - 1) * args.pageSize;
  const byKind: Record<string, number> = {};
  for (const c of items) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  return {
    run: args.run,
    items: items.slice(start, start + args.pageSize),
    total,
    page: args.page,
    pageSize: args.pageSize,
    totalPages: Math.max(1, Math.ceil(total / args.pageSize)),
    summary: { total, byKind, byStatus: {}, critical: 0 },
  };
}

// getBarrierSyncDetail: full before/after for one barrier in scope. Prefers
// the audit row; falls back to current barrier + history slice.
export async function getBarrierSyncDetail(
  barrierId: number,
  opts: { runId?: number | null; sinceHours?: number | null } = {},
): Promise<SyncBarrierDetail | null> {
  try {
    const conds = [`c.barrier_id = $1`];
    const params: unknown[] = [barrierId];
    if (opts.runId !== undefined && opts.runId !== null) {
      params.push(opts.runId);
      conds.push(`c.run_id = $${params.length}`);
    } else if (opts.sinceHours !== undefined && opts.sinceHours !== null) {
      const h = Math.max(1, Math.min(72, opts.sinceHours));
      params.push(new Date(Date.now() - h * 3600_000).toISOString());
      conds.push(`c.created_at >= $${params.length}::timestamptz`);
    }
    const rows = await queryRows<{
      barrier_id: number;
      tag: string;
      location: string;
      kind: string;
      old_availability_id: number | null;
      new_availability_id: number | null;
      changed_fields: unknown;
      old_snapshot: unknown;
      new_snapshot: unknown;
      created_at: string;
      run_id: number;
    }>(
      `select c.barrier_id, b.tag, coalesce(l.name, l.code, '') as location,
        c.kind, c.old_availability_id, c.new_availability_id,
        c.changed_fields, c.old_snapshot, c.new_snapshot,
        c.created_at, c.run_id
       from sync_barrier_changes c
       join barriers b on b.id = c.barrier_id
       left join locations l on l.id = b.location_id
       where ${conds.join(" and ")}
       order by c.created_at desc, c.id desc limit 1`,
      params,
    );
    const r = rows[0];
    if (!r) return null;
    const asRecord = (v: unknown): Record<string, unknown> =>
      typeof v === "object" && v !== null ? v as Record<string, unknown> : {};
    const oldSnapshot = asRecord(r.old_snapshot);
    const newSnapshot = asRecord(r.new_snapshot);
    // Snapshots store numeric ids (typologyId, criticalityId, ...); bare
    // numbers mean nothing in the UI ("Tipologia 3 → 0"), so resolve id
    // fields to display labels before returning. DB vocabularies win over
    // seed enums (locations/categories are dynamic); a lookup failure
    // keeps raw ids and the client formats them via seed enums instead.
    try {
      const [labels, availRows, critRows] = await Promise.all([
        getResolverLabels(),
        queryRows<{ id: number; label: string }>(
          `select id, label from availability_statuses`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from criticality_levels`,
        ),
      ]);
      const avail: Record<number, string> = Object.fromEntries(
        availRows.map((x) => [x.id, x.label]),
      );
      const crit: Record<number, string> = Object.fromEntries(
        critRows.map((x) => [x.id, x.label]),
      );
      const resolveSnapshot = (
        snap: Record<string, unknown>,
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...snap };
        const num = (k: string): number | null => {
          const v = snap[k];
          return typeof v === "number" && Number.isInteger(v) ? v : null;
        };
        const id = num("locationId");
        if (id !== null) {
          out.locationId = labels.locations[id] ?? fromLocationId(id);
        }
        const typ = num("typologyId");
        if (typ !== null) {
          out.typologyId = labels.typologies[typ] ?? fromTypologyId(typ);
        }
        const loc = num("locDescId");
        if (loc !== null) {
          out.locDescId = labels.locDescs[loc] ?? fromLocDescId(loc);
        }
        const cri = num("criticalityId");
        if (cri !== null) {
          out.criticalityId = crit[cri] ?? fromCriticalityId(cri);
        }
        const cat = num("categoryId");
        if (cat !== null) {
          out.categoryId = labels.categories[cat] ?? fromCategoryId(cat);
        }
        const grp = num("groupingId");
        if (grp !== null) {
          out.groupingId = labels.groupings[grp] ?? fromGroupingId(grp);
        }
        const own = snap["ownerId"];
        if (typeof own === "number" && Number.isInteger(own)) {
          out.ownerId = own < 0 ? "" : labels.owners[own] ?? fromOwnerId(own);
        }
        const av = num("availabilityId");
        if (av !== null) {
          out.availabilityId = avail[av] ?? fromAvailabilityId(av);
        }
        return out;
      };
      return {
        barrierId: r.barrier_id,
        tag: r.tag,
        location: r.location,
        kind: (["new", "updated", "removed", "restored"] as const).includes(
            r.kind as "new",
          )
          ? (r.kind as SyncBarrierDetail["kind"])
          : "updated",
        oldAvailabilityId: r.old_availability_id,
        newAvailabilityId: r.new_availability_id,
        changedFields: Array.isArray(r.changed_fields)
          ? (r.changed_fields as string[])
          : [],
        oldSnapshot: resolveSnapshot(oldSnapshot),
        newSnapshot: resolveSnapshot(newSnapshot),
        changedAt: r.created_at,
        runId: r.run_id,
      };
    } catch {
      // Label lookups are best-effort; raw ids still render client-side.
    }
    return {
      barrierId: r.barrier_id,
      tag: r.tag,
      location: r.location,
      kind: (["new", "updated", "removed", "restored"] as const).includes(
          r.kind as "new",
        )
        ? (r.kind as SyncBarrierDetail["kind"])
        : "updated",
      oldAvailabilityId: r.old_availability_id,
      newAvailabilityId: r.new_availability_id,
      changedFields: Array.isArray(r.changed_fields)
        ? (r.changed_fields as string[])
        : [],
      oldSnapshot: asRecord(r.old_snapshot),
      newSnapshot: asRecord(r.new_snapshot),
      changedAt: r.created_at,
      runId: r.run_id,
    };
  } catch {
    return null;
  }
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
  // Persistence confirmation: the cycle path already notifies via [ops],
  // but only this line proves the failed row actually landed in sync_state
  // (a DB outage between notify and insert would otherwise look recorded).
  console.error(
    `[sync] recorded failure scope=${scope} note=${note.slice(0, 200)}`,
  );
}
