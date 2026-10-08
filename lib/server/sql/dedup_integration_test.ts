// Dedup integration - DB-backed guards against duplication.
// This is why it exists: same-status PATCHes, direct availability writes,
// audit retries, and racing sync leases each had a duplication path;
// these tests pin the fixes. Skipped when DATABASE_URL is unset, and
// each test cleans up its own rows.
import {
  defaultSyncIo,
  isUniqueViolation,
  recordBarrierChange,
} from "./sync.ts";

import { getBarrierById, transitionBarrierStatus } from "./barriers.ts";

import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { ScopeBusyError } from "../fracttal/sync.ts";

import { queryRows } from "../db.ts";

async function firstBarrier(): Promise<
  { id: number; availability_id: number } | null
> {
  const rows = await queryRows<{ id: number; availability_id: number }>(
    `select id, availability_id from barriers
     where deleted_at is null order by id limit 1`,
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

Deno.test("same-status transition writes no history row", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const seed = await firstBarrier();
  if (!seed) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const authorId = await firstAuthorId();
  const before = await queryRows<{ n: number }>(
    `select count(*)::int as n from barrier_status_history
     where barrier_id = $1`,
    [seed.id],
  );
  const result = await transitionBarrierStatus(
    seed.id,
    seed.availability_id,
    authorId,
    "dedup-test no-op",
  );
  assert(result, "barrier vanished mid-test");
  const after = await queryRows<{ n: number }>(
    `select count(*)::int as n from barrier_status_history
     where barrier_id = $1`,
    [seed.id],
  );
  assertStrictEquals(after[0]!.n, before[0]!.n);
  const current = await getBarrierById(seed.id);
  assertStrictEquals(current!.availabilityId, seed.availability_id);
});

Deno.test("direct availability UPDATE is rejected by the guard", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const seed = await firstBarrier();
  if (!seed) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const other = await queryRows<{ id: number }>(
    `select id from availability_statuses where id != $1 order by id limit 1`,
    [seed.availability_id],
  );
  assert(other[0], "need a second availability status");
  let threw = "";
  try {
    await queryRows(
      `update barriers set availability_id = $2 where id = $1`,
      [seed.id, other[0].id],
    );
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  assert(
    threw.includes("record_status_change"),
    `expected guard rejection, got: ${threw}`,
  );
  assert(isUniqueViolation({ code: "23505" }), "helper sanity");
  const current = await getBarrierById(seed.id);
  assertStrictEquals(current!.availabilityId, seed.availability_id);
});

Deno.test("audit retry for the same run inserts once", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const seed = await firstBarrier();
  if (!seed) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const runs = await queryRows<{ id: number }>(
    `insert into sync_state (scope, status, started_at, finished_at, note)
     values ('dedup-test', 'ok', now(), now(), 'dedup-test')
     returning id`,
  );
  const runId = runs[0]!.id;
  try {
    const change = {
      barrierId: seed.id,
      kind: "updated",
      oldAvailabilityId: seed.availability_id,
      newAvailabilityId: seed.availability_id,
      changedFields: [] as string[],
      oldSnapshot: {},
      newSnapshot: {},
    };
    await recordBarrierChange(runId, change);
    await recordBarrierChange(runId, change);
    const counted = await queryRows<{ n: number }>(
      `select count(*)::int as n from sync_barrier_changes
       where run_id = $1 and barrier_id = $2`,
      [runId, seed.id],
    );
    assertStrictEquals(counted[0]!.n, 1);
  } finally {
    await queryRows(`delete from sync_barrier_changes where run_id = $1`, [
      runId,
    ]);
    await queryRows(`delete from sync_state where id = $1`, [runId]);
  }
});

Deno.test("second running lease for a scope is busy", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const scope = "dedup-test-scope";
  await queryRows(
    `delete from sync_state where scope = $1 and status = 'running'`,
    [scope],
  );
  const runId = await defaultSyncIo.startRun(scope);
  try {
    let busy = false;
    try {
      await defaultSyncIo.startRun(scope);
    } catch (err) {
      busy = err instanceof ScopeBusyError;
    }
    assertStrictEquals(busy, true);
  } finally {
    await defaultSyncIo.finishRun(
      runId,
      "ok",
      { inserts: 0, updates: 0, deletes: 0, skips: 0 },
      "dedup-test",
    );
  }
});
