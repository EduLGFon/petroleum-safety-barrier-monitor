// Field ownership integration: admin-edited fields survive the sync apply,
// released fields follow Fracttal again. Needs a real Postgres: skipped with
// a log line when DATABASE_URL is unset so `deno task test` stays green
// without a database. Touches one existing barrier and restores it in
// `finally`.
import {
  fieldsSignature,
  type LocalBarrier,
  type PlanEntry,
  type SignatureSource,
} from "../fracttal/sync.ts";

import { getBarrierById, updateBarrier } from "./barriers.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { type SyncBarrierInput } from "../fracttal/map.ts";

import { defaultSyncIo } from "./sync.ts";

import { queryRows } from "../db.ts";

interface OwnedRow {
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
  has_contingency: string | null;
  contingency_desc: string | null;
  evidence_code: string | null;
  degradation_desc: string | null;
  extra_comments: string | null;
  manual_fields: string[] | null;
}

async function firstBarrier(): Promise<OwnedRow | null> {
  const rows = await queryRows<OwnedRow>(
    `select id, external_code, tag, location_id, typology_id, loc_desc_id,
            criticality_id, category_id, grouping_id, owner_id, comments,
            action_plan, source_updated_at, scope_source, is_active,
            availability_id, origin, install_local, equip_typology,
            field_installed, field_operational, op_status, has_maint_plan,
            plan_followed, failure_free, maint_status, has_contingency,
            contingency_desc, evidence_code, degradation_desc, extra_comments,
            manual_fields
     from barriers where deleted_at is null order by id limit 1`,
  );
  return rows[0] ?? null;
}

function toInput(
  row: OwnedRow,
  over: Partial<SyncBarrierInput> = {},
): SyncBarrierInput {
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
    availabilityId: row.availability_id,
    history: { note: "ownership-test", sourceAuthor: null, participants: [] },
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
    hasContingency: row.has_contingency ?? "Não",
    contingencyDesc: row.contingency_desc ?? "",
    evidenceCode: row.evidence_code ?? "",
    degradationDesc: row.degradation_desc ?? "",
    extraComments: row.extra_comments ?? "",
    sourceUpdatedAt: row.source_updated_at,
    isActive: row.is_active,
    scopeSource: row.scope_source,
    ...over,
  };
}

function toLocal(row: OwnedRow, manualFields: string[]): LocalBarrier {
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
    hasContingency: row.has_contingency ?? "Não",
    contingencyDesc: row.contingency_desc ?? "",
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
    signature: fieldsSignature(fields, manualFields),
    manualFields,
    fields,
  };
}

async function openRun(): Promise<number> {
  const rows = await queryRows<{ id: number }>(
    `insert into sync_state (scope, status, started_at, finished_at, note)
     values ('ownership-test', 'ok', now(), now(), 'ownership-test')
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

Deno.test("admin-owned fields survive sync apply, released fields revert", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const row = await firstBarrier();
  if (!row) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const before = await getBarrierById(row.id);
  assert(before, "seed barrier must be readable");
  const origOrigin = before.origin;
  const origComments = before.comments;
  const runId = await openRun();
  try {
    // Admin edits origin through the sanctioned path: PATCH marks it owned.
    const edited = await updateBarrier(row.id, { origin: "OWNERSHIP-TEST" });
    assert(
      edited!.manualFields?.includes("origin"),
      "PATCH must mark the edited field owned",
    );

    // Remote moves both the owned field and a sync-owned one.
    const entry: PlanEntry = {
      kind: "update",
      local: toLocal({ ...row, origin: "OWNERSHIP-TEST" }, ["origin"]),
      input: toInput(row, {
        origin: "SYNC-ORIGIN",
        comments: "sync note",
      }),
      statusChanged: false,
    };
    await defaultSyncIo.applyPlan([entry], runId);
    let current = await getBarrierById(row.id);
    assertStrictEquals(
      current!.origin,
      "OWNERSHIP-TEST",
      "owned origin was reverted by sync",
    );
    assertStrictEquals(
      current!.comments,
      "sync note",
      "sync-owned comments must still converge",
    );
    const audits = await queryRows<{ changed_fields: unknown }>(
      `select changed_fields from sync_barrier_changes
        where run_id = $1 and barrier_id = $2 order by id desc limit 1`,
      [runId, row.id],
    );
    assertStrictEquals(audits.length, 1);
    const changed = JSON.stringify(audits[0]!.changed_fields);
    assert(changed.includes("comments"), "audit must name the synced change");
    assert(
      !changed.includes("origin"),
      "audit must not claim the owned field changed",
    );

    // Release: the field follows Fracttal again on the next sweep.
    const released = await updateBarrier(row.id, {}, {
      releaseFields: ["origin"],
    });
    assert(
      !released!.manualFields?.includes("origin"),
      "release must drop the field from manual_fields",
    );
    const entry2: PlanEntry = {
      kind: "update",
      local: toLocal({ ...row, origin: "OWNERSHIP-TEST" }, []),
      input: toInput(row, { origin: "SYNC-ORIGIN" }),
      statusChanged: false,
    };
    await defaultSyncIo.applyPlan([entry2], runId);
    current = await getBarrierById(row.id);
    assertStrictEquals(
      current!.origin,
      "SYNC-ORIGIN",
      "released field must follow the sync again",
    );
  } finally {
    await closeRun(runId);
  }
  // Restore the seed barrier exactly (values + no test ownership).
  await updateBarrier(
    row.id,
    { origin: origOrigin, comments: origComments },
    { releaseFields: ["origin", "comments"] },
  );
  const restored = await getBarrierById(row.id);
  assertStrictEquals(restored!.origin, origOrigin);
  assertStrictEquals(restored!.comments, origComments);
  assertStrictEquals(restored!.manualFields?.length ?? 0, 0);
  // A no-change PATCH must not take ownership: the editor submits every
  // field on save, and that must never freeze the row.
  const untouched = await updateBarrier(row.id, {
    origin: origOrigin,
    comments: origComments,
  });
  assertStrictEquals(untouched!.manualFields?.length ?? 0, 0);
});
