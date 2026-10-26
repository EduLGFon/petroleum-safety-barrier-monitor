// Sync apply regression: an admin-set availability must survive the next
// sync, while a sync-owned availability still converges to upstream.
// Needs a real Postgres: skipped with a log line when DATABASE_URL is unset
// so `deno task test` stays green without a database. When set, it touches
// one existing barrier and restores it via the sanctioned path in `finally`.
import {
  fieldsSignature,
  type LocalBarrier,
  type PlanEntry,
  type SignatureSource,
} from "../fracttal/sync.ts";

import { getBarrierById, transitionBarrierStatus } from "./barriers.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { type SyncBarrierInput } from "../fracttal/map.ts";

import { defaultSyncIo, SYNC_AUTHOR_ID } from "./sync.ts";

import { queryRows } from "../db.ts";

interface BarrierRow {
  id: number;
  external_code: string;
  tag: string;
  location_id: number;
  typology_id: number;
  loc_desc_id: number;
  criticality_id: number;
  category_id: number;
  grouping_id: number;
  owner_id: number | null;
  comments: string;
  action_plan: string;
  source_updated_at: string | null;
  scope_source: string;
  is_active: boolean;
  availability_id: number;
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
  evidence_code: string | null;
  degradation_desc: string | null;
  extra_comments: string | null;
}

async function firstBarrier(): Promise<BarrierRow | null> {
  const rows = await queryRows<BarrierRow>(
    `select id, external_code, tag, location_id, typology_id, loc_desc_id,
            criticality_id, category_id, grouping_id, owner_id, comments,
            action_plan, source_updated_at, scope_source, is_active,
            availability_id, origin, install_local, equip_typology,
            field_installed, field_operational, op_status, has_maint_plan,
            plan_followed, failure_free, maint_status, evidence_code,
            degradation_desc, extra_comments
     from barriers where deleted_at is null order by id limit 1`,
  );
  return rows[0] ?? null;
}

async function firstAuthorId(): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `select id from authors order by id limit 1`,
  );
  assert(rows[0], "authors seed row missing");
  return rows[0].id;
}

async function otherAvailabilityId(current: number): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `select id from availability_statuses where id != $1 order by id limit 1`,
    [current],
  );
  assert(rows[0], "need a second availability status");
  return rows[0].id;
}

function toInput(row: BarrierRow, availabilityId: number): SyncBarrierInput {
  return {
    externalCode: row.external_code,
    tag: row.tag,
    locationId: row.location_id,
    typologyId: row.typology_id,
    locDescId: row.loc_desc_id,
    criticalityId: row.criticality_id,
    categoryId: row.category_id,
    groupingId: row.grouping_id,
    ownerId: row.owner_id,
    availabilityId,
    comments: row.comments,
    actionPlan: row.action_plan,
    origin: row.origin ?? "",
    installLocal: row.install_local ?? "",
    equipTypology: row.equip_typology ?? "",
    fieldInstalled: row.field_installed ?? "",
    fieldOperational: row.field_operational ?? "",
    opStatus: row.op_status ?? "",
    hasMaintPlan: row.has_maint_plan ?? "",
    planFollowed: row.plan_followed ?? "",
    failureFree: row.failure_free ?? "",
    maintStatus: row.maint_status ?? "",
    evidenceCode: row.evidence_code ?? "",
    degradationDesc: row.degradation_desc ?? "",
    extraComments: row.extra_comments ?? "",
    sourceUpdatedAt: row.source_updated_at,
    isActive: row.is_active,
    scopeSource: row.scope_source,
  };
}

function toLocal(row: BarrierRow): LocalBarrier {
  const fields: SignatureSource = {
    tag: row.tag,
    locationId: row.location_id,
    typologyId: row.typology_id,
    locDescId: row.loc_desc_id,
    criticalityId: row.criticality_id,
    categoryId: row.category_id,
    groupingId: row.grouping_id,
    ownerId: row.owner_id,
    comments: row.comments,
    actionPlan: row.action_plan,
    origin: row.origin ?? "",
    installLocal: row.install_local ?? "",
    equipTypology: row.equip_typology ?? "",
    fieldInstalled: row.field_installed ?? "",
    fieldOperational: row.field_operational ?? "",
    opStatus: row.op_status ?? "",
    hasMaintPlan: row.has_maint_plan ?? "",
    planFollowed: row.plan_followed ?? "",
    failureFree: row.failure_free ?? "",
    maintStatus: row.maint_status ?? "",
    evidenceCode: row.evidence_code ?? "",
    degradationDesc: row.degradation_desc ?? "",
    extraComments: row.extra_comments ?? "",
    isActive: row.is_active,
    scopeSource: row.scope_source,
  };
  return {
    id: row.id,
    externalCode: row.external_code,
    availabilityId: row.availability_id,
    deletedAt: null,
    signature: fieldsSignature(fields),
    fields,
  };
}

async function openRun(): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `insert into sync_state (scope, status, started_at, finished_at, note)
     values ('apply-reg-test', 'ok', now(), now(), 'apply-reg-test')
     returning id`,
  );
  return rows[0]!.id;
}

async function closeRun(runId: number): Promise<void> {
  await queryRows(`delete from sync_barrier_changes where run_id = $1`, [
    runId,
  ]);
  await queryRows(`delete from sync_state where id = $1`, [runId]);
}

function auditFor(runId: number, barrierId: number) {
  return queryRows<{
    old_availability_id: number | null;
    new_availability_id: number | null;
    changed_fields: unknown;
  }>(
    `select old_availability_id, new_availability_id, changed_fields
     from sync_barrier_changes
     where run_id = $1 and barrier_id = $2
     order by id desc limit 1`,
    [runId, barrierId],
  );
}

Deno.test("sync does not revert an admin-set availability", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const row = await firstBarrier();
  if (!row) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const authorId = await firstAuthorId();
  // A real author (id 0) is never the sync author (id 10).
  assertStrictEquals(authorId !== SYNC_AUTHOR_ID, true);
  const adminStatus = await otherAvailabilityId(row.availability_id);
  // Admin sets a status that differs from the seed (remote) value.
  await transitionBarrierStatus(
    row.id,
    adminStatus,
    authorId,
    "admin override",
  );
  let current = await getBarrierById(row.id);
  assertStrictEquals(current!.availabilityId, adminStatus);
  // Sync input keeps the ORIGINAL seed availability: remote is unchanged,
  // so the plan flags statusChanged but the admin owns the current status.
  const runId = await openRun();
  try {
    const entry: PlanEntry = {
      kind: "update",
      local: toLocal(row),
      input: toInput(row, row.availability_id),
      statusChanged: true,
    };
    await defaultSyncIo.applyPlan([entry], runId);
    current = await getBarrierById(row.id);
    assertStrictEquals(
      current!.availabilityId,
      adminStatus,
      "admin-set availability was reverted by sync",
    );
    // The audit row must not claim an availability change that never landed.
    const audits = await auditFor(runId, row.id);
    assertStrictEquals(audits.length, 1);
    assertStrictEquals(audits[0]!.old_availability_id, adminStatus);
    assertStrictEquals(audits[0]!.new_availability_id, adminStatus);
    assertStrictEquals(
      JSON.stringify(audits[0]!.changed_fields).includes("availabilityId"),
      false,
    );
  } finally {
    await closeRun(runId);
  }
  // Restore the seed barrier to its original status (sanctioned path).
  await transitionBarrierStatus(
    row.id,
    row.availability_id,
    authorId,
    "reg-test cleanup",
  );
});

Deno.test("sync still propagates a remote change to a sync-owned status", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const row = await firstBarrier();
  if (!row) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const authorId = await firstAuthorId();
  const remoteStatus = await otherAvailabilityId(row.availability_id);
  // Mark the current status as sync-owned: latest history author is the sync
  // author, so upstream changes still converge to this barrier.
  await queryRows(
    `insert into barrier_status_history (barrier_id, date, status_id, author_id, note)
     values ($1, current_date, $2, $3, 'reg-test sync-owned setup')`,
    [row.id, row.availability_id, SYNC_AUTHOR_ID],
  );
  const runId = await openRun();
  try {
    const entry: PlanEntry = {
      kind: "update",
      local: toLocal(row),
      input: toInput(row, remoteStatus),
      statusChanged: true,
    };
    await defaultSyncIo.applyPlan([entry], runId);
  } finally {
    await closeRun(runId);
  }
  const current = await getBarrierById(row.id);
  assertStrictEquals(
    current!.availabilityId,
    remoteStatus,
    "sync-owned status was not propagated to upstream",
  );
  // Restore the seed barrier and remove the setup history row.
  await queryRows(
    `delete from barrier_status_history
     where barrier_id = $1 and note = 'reg-test sync-owned setup'`,
    [row.id],
  );
  await transitionBarrierStatus(
    row.id,
    row.availability_id,
    authorId,
    "reg-test cleanup",
  );
});
