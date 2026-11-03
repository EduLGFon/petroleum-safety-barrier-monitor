// Sync SQL repository - the real default SyncIo for lib/server/fracttal/sync.
// This is why it exists: reconcile plans are pure, but applying them touches
// barriers + history + sync_state. Every write is idempotent (UNIQUE
// external_code + where guards), status changes go through the one sanctioned
// record_status_change() path, and deletions are soft (deleted_at).
import {
  fieldsSignature,
  type LocalBarrier,
  type PlanCounts,
  ScopeBusyError,
  type SignatureSource,
  type SyncIo,
} from "../fracttal/sync.ts";

import type { CatalogNeeds, MapContext } from "../fracttal/map.ts";

import { queryRows, withTx } from "../db.ts";

import { log } from "../log.ts";

import { SYNC_FRESH_MINUTES, SYNC_STALE_MINUTES } from "./sync-status.ts";

export { SYNC_APPLY_CHUNK, SYNC_AUTHOR_ID } from "./sync-constants.ts";

import { applyPlanEntries } from "./sync-apply.ts";

// Freshness windows for the status indicator, in minutes. A `running` row
// newer than SYNC_FRESH_MINUTES means a sync is in flight; one older than
// SYNC_STALE_MINUTES means the poller likely crashed mid-run.

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
    log.child({ scope: "sync" }).info("reaped stale running rows", {
      scope,
      count: n,
    });
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
    log.child({ scope: "sync" }).warn("best-effort heartbeat failed", { err });
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
  // Concurrency: max(id)+1 allocation is serialized per table with a
  // transaction-scoped advisory lock, so two racing cycles cannot pick
  // the same next id (the UNIQUE label/code constraint is the backstop).
  async ensureCatalog(needs: CatalogNeeds): Promise<void> {
    if (needs.categories.length === 0 && needs.locations.length === 0) {
      return;
    }
    await withTx(async (tx) => {
      if (needs.categories.length > 0) {
        await tx(`select pg_advisory_xact_lock(hashtext('categories'))`, []);
        const have = await tx<{ id: number }>(
          `select id from categories`,
          [],
        );
        let next = have.reduce((m, r) => Math.max(m, r.id), -1) + 1;
        for (let i = 0; i < needs.categories.length; i += 500) {
          const chunk = needs.categories.slice(i, i + 500);
          const placeholders = chunk
            .map((_, k) => `($${2 * k + 1}, $${2 * k + 2})`)
            .join(", ");
          const args: unknown[] = [];
          for (const label of chunk) args.push(next++, label);
          await tx(
            `insert into categories (id, label) values ${placeholders} ` +
              `on conflict (label) do nothing`,
            args,
          );
        }
      }
      if (needs.locations.length > 0) {
        await tx(`select pg_advisory_xact_lock(hashtext('locations'))`, []);
        const have = await tx<{ id: number }>(
          `select id from locations`,
          [],
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
          await tx(
            `insert into locations (id, code, type, name) values ${placeholders} ` +
              `on conflict (code) do nothing`,
            args,
          );
        }
      }
    });
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
      origin: string | null;
      install_local: string | null;
      equip_typology: string | null;
      field_installed: string | null;
      field_operational: string | null;
      op_status: string | null;
      has_maint_plan: string | null;
      plan_followed: string | null;
      failure_free: string | null;
      maint_status: string | null;
      has_contingency: string | null;
      contingency_desc: string | null;
      evidence_code: string | null;
      degradation_desc: string | null;
      extra_comments: string | null;
      manual_fields: string[] | null;
    }>(
      `select id, external_code, location_id, availability_id, deleted_at,
         is_active,
         tag, typology_id, loc_desc_id, criticality_id, category_id,
         grouping_id, owner_id, comments, action_plan,
         coalesce(scope_source, '') as scope_source,
         origin, install_local, equip_typology, field_installed,
         field_operational, op_status, has_maint_plan, plan_followed,
         failure_free, maint_status, has_contingency, contingency_desc,
         evidence_code, degradation_desc,
         extra_comments, manual_fields
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
        origin: r.origin ?? "",
        installLocal: r.install_local ?? "",
        equipTypology: r.equip_typology ?? "",
        fieldInstalled: r.field_installed ?? "",
        fieldOperational: r.field_operational ?? "",
        opStatus: r.op_status ?? "",
        hasMaintPlan: r.has_maint_plan ?? "",
        planFollowed: r.plan_followed ?? "",
        failureFree: r.failure_free ?? "",
        maintStatus: r.maint_status ?? "",
        hasContingency: r.has_contingency ?? "Não",
        contingencyDesc: r.contingency_desc ?? "",
        evidenceCode: r.evidence_code ?? "",
        degradationDesc: r.degradation_desc ?? "",
        extraComments: r.extra_comments ?? "",
      };
      // Pre-migration nulls read as sync-owned (the old default views).
      const manualFields = Array.isArray(r.manual_fields)
        ? r.manual_fields.filter((v): v is string => typeof v === "string")
        : [];
      return {
        id: r.id,
        externalCode: r.external_code,
        availabilityId: r.availability_id,
        deletedAt: r.deleted_at,
        signature: fieldsSignature(fields, manualFields),
        manualFields,
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
      log.child({ scope: "sync" }).warn("best-effort reapStaleRuns failed", {
        scope,
        err,
      });
    }
    // Atomic claim: the INSERT only fires when no fresh lease exists, so
    // two processes racing past the pollOnce lock cannot both open a run.
    // The loser gets ScopeBusyError (mapped to `skipped`, never a failure).
    // The partial unique index is the backstop for the check-then-insert
    // race. ON CONFLICT turns a routine loser into an empty result without
    // emitting a PostgreSQL ERROR log.
    const rows = await queryRows<{ id: number }>(
      `insert into sync_state (scope, status, started_at, finished_at)
       select $1, 'running', now(), now()
       where not exists (
         select 1 from sync_state
         where scope = $1 and status = 'running'
           and finished_at >= now() - make_interval(mins => $2)
       )
       on conflict (scope) where status = 'running' do nothing
       returning id`,
      [scope, SYNC_FRESH_MINUTES],
    );
    const started = rows[0];
    if (!started) {
      throw new ScopeBusyError(`[sync] scope ${scope} already running`);
    }
    log.child({ scope: "sync" }).info("run started", {
      scope,
      runId: started.id,
    });
    return started.id;
  },

  // heartbeat: refresh the running lease so the reaper and the lock see
  // this run as alive. Best-effort: a lost heartbeat only risks a false
  // reap on very slow runs, never fails the run itself.
  async heartbeat(runId: number): Promise<void> {
    await touchSyncRun(runId);
  },

  applyPlan: applyPlanEntries,
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
    log.child({ scope: "sync" }).info("run finished", {
      runId,
      status,
      inserts: counts.inserts,
      updates: counts.updates,
      deletes: counts.deletes,
      skips: counts.skips,
      note: note.slice(0, 120),
    });
  },
};
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
  log.child({ scope: "sync" }).error("recorded failure", {
    scope,
    note: note.slice(0, 200),
  });
}

export {
  getSyncStatus,
  isStaleActive,
  SYNC_FRESH_MINUTES,
  SYNC_STALE_MINUTES,
  toSyncStatus,
} from "./sync-status.ts";
export type { SyncStatusRow } from "./sync-status.ts";

// Read/audit queries live in sync-read.ts to keep this write path smaller.
export {
  getBarrierSyncDetail,
  getLatestFinishedRun,
  getSyncRecentChanges,
  getSyncRuns,
  listSyncChanges,
} from "./sync-read.ts";
export type {
  ListSyncChangesArgs,
  ListSyncChangesResult,
} from "./sync-read.ts";

// Apply helpers live in sync-apply.ts; keep the existing public import path.
export { recordBarrierChange } from "./sync-apply.ts";
