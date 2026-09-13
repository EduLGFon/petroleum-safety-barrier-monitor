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

import { queryRows } from "../db.ts";

export const SYNC_AUTHOR_ID = 10; // authors.id, see db/seed_lookups.sql

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

  async loadLocal(scopeLocationIds: number[]): Promise<LocalBarrier[]> {
    if (scopeLocationIds.length === 0) return [];
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
       order by id`,
    );
    const inScope = new Set(scopeLocationIds);
    return rows
      .filter((r) => inScope.has(r.location_id))
      .map((r) => ({
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
    return rows[0]!.id;
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
      // update / restore: same field write; restore clears deleted_at.
      await queryRows(
        `update barriers set
           tag = $2, typology_id = $3, loc_desc_id = $4, criticality_id = $5,
           category_id = $6, grouping_id = $7, owner_id = $8,
           comments = $9, action_plan = $10, source_updated_at = $11,
           deleted_at = case when $12 then null else deleted_at end
         where id = $1`,
        [
          entry.local.id,
          input.tag,
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
