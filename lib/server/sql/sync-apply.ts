// Sync apply path - plan application, row/audit writes, and ownership
// checks. Split out of sync.ts so the write pipeline can be reviewed on its
// own; sync.ts re-exports the public pieces.
import {
  diffSignatureFields,
  type PlanCounts,
  type PlanEntry,
  snapshotOf,
} from "../fracttal/sync.ts";
import { queryRows, type TxQuery, withTx } from "../db.ts";
import { log } from "../log.ts";
import { SYNC_APPLY_CHUNK, SYNC_AUTHOR_ID } from "./sync-constants.ts";

export async function applyPlanEntries(
  entries: PlanEntry[],
  runId?: number | null,
  onProgress?: (counts: PlanCounts) => void,
): Promise<PlanCounts> {
  const counts: PlanCounts = { inserts: 0, updates: 0, deletes: 0, skips: 0 };
  const rid = runId ?? null;
  // Latest history author per touched barrier, null when the barrier has no
  // status transition history (legacy / seed rows). A barrier whose latest
  // transition was authored by someone other than the sync author is an
  // admin override: the next sweep must respect it instead of reverting it
  // to the remote value, otherwise the admin's change is dropped on the
  // next sync.
  const syncTouchedIds = entries
    .filter((e) => e.kind === "update" || e.kind === "restore")
    .map((e) => e.local.id);
  const latestAuthors = await loadLatestStatusAuthors(syncTouchedIds);
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
              "select record_status_change($1, $2, $3, $4, $5, $6, $7::jsonb)",
              [
                id,
                input.availabilityId,
                SYNC_AUTHOR_ID,
                input.history.note,
                rid,
                input.history.sourceAuthor,
                JSON.stringify(input.history.participants),
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
        // station moves persist); restore clears deleted_at. Contingency
        // is sync-owned (M1/M2): an explicit Sim/ Não always lands so a
        // closed work order clears a stale auto Sim; a null desc becomes
        // null, a Sim keeps its source and a Não clears to null.
        //
        // SECURITY/DATA INTEGRITY: ownership is checked in the UPDATE
        // itself, not from the plan-time snapshot. A long sweep must not
        // overwrite a field an admin took over after the plan was built.
        // `manual_fields` on the right-hand side is the current row value.
        const owned = new Set(entry.local.manualFields ?? []);
        const sets: string[] = [];
        const updateArgs: unknown[] = [entry.local.id];
        const add = (col: string, val: unknown) => {
          updateArgs.push(val);
          sets.push(`${col} = $${updateArgs.length}`);
        };
        const addOwned = (key: string, col: string, val: unknown) => {
          updateArgs.push(val);
          sets.push(
            `${col} = case when '${key}' = any(manual_fields) then ${col} else $${updateArgs.length} end`,
          );
        };
        addOwned("tag", "tag", input.tag);
        addOwned("locationId", "location_id", input.locationId);
        addOwned("typologyId", "typology_id", input.typologyId);
        add("loc_desc_id", input.locDescId);
        addOwned("criticalityId", "criticality_id", input.criticalityId);
        addOwned("categoryId", "category_id", input.categoryId);
        addOwned("groupingId", "grouping_id", input.groupingId);
        addOwned("ownerId", "owner_id", input.ownerId);
        addOwned("comments", "comments", input.comments);
        addOwned("actionPlan", "action_plan", input.actionPlan);
        add("source_updated_at", input.sourceUpdatedAt);
        add("scope_source", input.scopeSource);
        add("is_active", input.isActive);
        updateArgs.push(entry.kind === "restore");
        sets.push(
          `deleted_at = case when $${updateArgs.length} then null else deleted_at end`,
        );
        // hasContingency owns the pair: a manual flag keeps its
        // description too, since the auto desc is only meaningful with
        // the auto flag.
        updateArgs.push(input.hasContingency ?? null);
        const flagParam = updateArgs.length;
        updateArgs.push(input.contingencyDesc ?? null);
        const descParam = updateArgs.length;
        sets.push(
          `has_contingency = case when 'hasContingency' = any(manual_fields) then has_contingency else coalesce($${flagParam}, 'Não') end`,
        );
        sets.push(
          `contingency_desc = case when 'hasContingency' = any(manual_fields) then contingency_desc else case when coalesce($${flagParam}, 'Não') = 'Sim' then nullif($${descParam}, '') else null end end`,
        );
        addOwned("origin", "origin", input.origin);
        addOwned("installLocal", "install_local", input.installLocal);
        addOwned("equipTypology", "equip_typology", input.equipTypology);
        addOwned("fieldInstalled", "field_installed", input.fieldInstalled);
        addOwned(
          "fieldOperational",
          "field_operational",
          input.fieldOperational,
        );
        addOwned("opStatus", "op_status", input.opStatus);
        addOwned("hasMaintPlan", "has_maint_plan", input.hasMaintPlan);
        addOwned("planFollowed", "plan_followed", input.planFollowed);
        addOwned("failureFree", "failure_free", input.failureFree);
        addOwned("maintStatus", "maint_status", input.maintStatus);
        addOwned("evidenceCode", "evidence_code", input.evidenceCode);
        addOwned(
          "degradationDesc",
          "degradation_desc",
          input.degradationDesc,
        );
        addOwned("extraComments", "extra_comments", input.extraComments);
        await tx(
          `update barriers set ${sets.join(", ")} where id = $1`,
          updateArgs,
        );
        // Re-read the latest author inside the transaction when the
        // status is about to change. The plan-time snapshot can be stale
        // on a long sweep; an admin override that landed mid-run must win.
        let lastAuthor = latestAuthors.get(entry.local.id) ?? null;
        if (entry.statusChanged) {
          const latest = await tx<{ author_id: number }>(
            `select author_id from barrier_status_history
             where barrier_id = $1
             order by created_at desc, id desc limit 1`,
            [entry.local.id],
          );
          lastAuthor = latest[0]?.author_id ?? null;
        }
        // An admin-authored latest transition is an explicit override: the
        // sync must not revert it to the remote value on the next sweep.
        // Only sync-owned statuses (latest author is the sync author, or no
        // history row at all - legacy / seed) get overwritten by upstream.
        const adminOwnsStatus = !statusIsSyncOwned(lastAuthor);
        const propagateStatus = entry.statusChanged && !adminOwnsStatus;
        if (propagateStatus) {
          await tx(
            "select record_status_change($1, $2, $3, $4, $5, $6, $7::jsonb)",
            [
              entry.local.id,
              input.availabilityId,
              SYNC_AUTHOR_ID,
              input.history.note,
              rid,
              input.history.sourceAuthor,
              JSON.stringify(input.history.participants),
            ],
          );
        }
        counts.updates++;
        audits.push({
          barrierId: entry.local.id,
          kind: entry.kind === "restore" ? "restored" : "updated",
          oldAvailabilityId: entry.local.availabilityId,
          newAvailabilityId: propagateStatus
            ? input.availabilityId
            : entry.local.availabilityId,
          changedFields: diffSignatureFields(
            entry.local.fields,
            input,
            propagateStatus,
            [...owned],
          ),
          oldSnapshot: entry.local.fields
            ? snapshotOf(entry.local.fields, entry.local.availabilityId)
            : { availabilityId: entry.local.availabilityId },
          newSnapshot: snapshotOf(
            input,
            propagateStatus ? input.availabilityId : entry.local.availabilityId,
          ),
        });
      }
    });
    await insertAuditBatch(rid, audits);
    // Snapshot after every committed chunk: a later chunk failure must
    // still report the rows that already landed.
    onProgress?.({ ...counts });
  }
  return counts;
}

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
  hasContingency?: string | null;
  contingencyDesc?: string;
  origin: string;
  installLocal: string;
  equipTypology: string;
  fieldInstalled: string;
  fieldOperational: string;
  opStatus: string;
  hasMaintPlan: string;
  planFollowed: string;
  failureFree: string;
  maintStatus: string;
  evidenceCode: string;
  degradationDesc: string;
  extraComments: string;
}, query: TxQuery = queryRows): Promise<number | null> {
  const rows = await query<{ id: number }>(
    `insert into barriers
       (external_code, tag, location_id, typology_id, loc_desc_id,
        criticality_id, category_id, grouping_id, owner_id,
        availability_id, comments, action_plan, status_since,
        source_updated_at, scope_source, is_active,
        has_contingency, contingency_desc,
        origin, install_local, equip_typology, field_installed,
        field_operational, op_status, has_maint_plan, plan_followed,
        failure_free, maint_status, evidence_code, degradation_desc,
        extra_comments)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, current_date, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
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
      input.hasContingency ?? "Não",
      input.contingencyDesc || null,
      input.origin,
      input.installLocal,
      input.equipTypology,
      input.fieldInstalled,
      input.fieldOperational,
      input.opStatus,
      input.hasMaintPlan,
      input.planFollowed,
      input.failureFree,
      input.maintStatus,
      input.evidenceCode,
      input.degradationDesc,
      input.extraComments,
    ],
  );
  return rows[0]?.id ?? null;
}

// statusIsSyncOwned: true when the local availability was last set by the
// sync itself (latest history author is the sync author) or was never set
// through record_status_change (no history row, e.g. legacy / seed rows).
// When an admin's author id is the latest transition, the admin explicitly
// owns the current status and the sync must not clobber it on the next sweep.
export function statusIsSyncOwned(
  latestHistoryAuthorId: number | null,
): boolean {
  return (
    latestHistoryAuthorId === null ||
    latestHistoryAuthorId === SYNC_AUTHOR_ID
  );
}

// loadLatestStatusAuthors: latest history author per queried barrier, null
// when the barrier has no status transition history. Used by applyPlan so a
// sync never overwrites a status an admin explicitly set.
async function loadLatestStatusAuthors(
  ids: number[],
): Promise<Map<number, number | null>> {
  const authors = new Map<number, number | null>();
  for (const id of ids) authors.set(id, null);
  if (ids.length === 0) return authors;
  const rows = await queryRows<{
    barrier_id: number;
    author_id: number;
  }>(
    `select distinct on (barrier_id) barrier_id, author_id
     from barrier_status_history
     where barrier_id = any($1::int[])
     order by barrier_id, created_at desc, id desc`,
    [ids],
  );
  for (const r of rows) authors.set(r.barrier_id, r.author_id);
  return authors;
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
// Idempotent: ON CONFLICT DO NOTHING on uniq_sync_changes_run_barrier,
// so retrying the same run never double-inserts.
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
       values ${values.join(", ")}
        on conflict (run_id, barrier_id) do nothing`,
      args,
    );
  } catch (err) {
    log.child({ scope: "sync" }).warn("audit batch failed, retrying per row", {
      runId,
      count: audits.length,
      err,
    });
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

// HistoryTouch: raw join shape for the recent-changes list below.
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
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
        on conflict (run_id, barrier_id) do nothing`,
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
    log.child({ scope: "sync" }).warn("recordBarrierChange skipped", {
      runId,
      barrierId: change.barrierId,
      err,
    });
  }
}
