// Barrier write-path and projection regression tests.
// This is why it exists: status transitions and manual-field merges must be
// atomic, list ordering must be deterministic, deleted_at must be labelled
// UTC, and the degraded-urgent backfill must be all-or-nothing. Pure tests
// run everywhere; DB tests log a visible skip when DATABASE_URL is unset.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import {
  buildListOrderBy,
  getBarrierById,
  runAtomic,
  transitionBarrierStatus,
  updateBarrier,
} from "./barriers.ts";

import type { BarrierRow } from "./mappers.ts";

import { SELECT_COLUMNS, SELECT_LIST_COLUMNS } from "./mappers.ts";

import type { TxQuery } from "../db.ts";

import { queryRows } from "../db.ts";

import {
  applyDemotions,
  type BackfillClient,
  type DegradedBarrierRow,
} from "../../../scripts/backfill-degraded-urgent.ts";

interface Call {
  text: string;
  args: Array<unknown>;
}

// recordingQuery: fake TxQuery that captures every statement and returns the
// rows the handler chooses. Lets the write paths be tested without Postgres.
function recordingQuery(
  handler: (text: string, args: Array<unknown>) => unknown[],
): { query: TxQuery; calls: Call[] } {
  const calls: Call[] = [];
  const query: TxQuery = <U>(
    text: string,
    args: Array<unknown> = [],
  ): Promise<U[]> => {
    calls.push({ text, args });
    return Promise.resolve(handler(text, args) as U[]);
  };
  return { query, calls };
}

// barrierRow: complete BarrierRow fixture; tests override only what they read.
function barrierRow(overrides: Partial<BarrierRow> = {}): BarrierRow {
  return {
    id: 1,
    tag: "TAG-1",
    typology_id: 1,
    location_id: 1,
    loc_desc_id: 1,
    criticality_id: 1,
    category_id: 1,
    grouping_id: 1,
    owner_id: -1,
    availability_id: 0,
    comments: "",
    action_plan: "",
    status_since: "2026-01-01",
    status_history: [],
    is_active: true,
    deleted_at: null,
    origin: null,
    external_code: "EXT-1",
    location_name: "Location",
    install_local: null,
    equip_typology: null,
    field_installed: null,
    field_operational: null,
    op_status: null,
    has_maint_plan: null,
    plan_followed: null,
    failure_free: null,
    maint_status: null,
    has_contingency: null,
    contingency_desc: null,
    contingency_tag: null,
    evidence_code: null,
    degradation_desc: null,
    extra_comments: null,
    manual_fields: [],
    ...overrides,
  };
}

function isProjection(text: string): boolean {
  return text.includes("from barriers b");
}

Deno.test("runAtomic opens a transaction only when no query was supplied", async () => {
  let begins = 0;
  const query: TxQuery = () => Promise.resolve([]);
  const begin = <T>(fn: (q: TxQuery) => Promise<T>): Promise<T> => {
    begins++;
    return fn(query);
  };

  assertStrictEquals(
    await runAtomic(undefined, () => Promise.resolve(42), begin),
    42,
  );
  assertStrictEquals(begins, 1);
  assertStrictEquals(
    await runAtomic(query, () => Promise.resolve(7), begin),
    7,
  );
  assertStrictEquals(begins, 1);
});

Deno.test("list order appends a unique b.id tie-breaker", () => {
  for (const sortCol of [undefined, "id", "tag", "status", "owner", "bogus"]) {
    for (const sortDir of ["asc", "desc"] as const) {
      const orderBy = buildListOrderBy(sortCol, sortDir);
      assertStrictEquals(orderBy.endsWith(", b.id asc"), true);
    }
  }
});

Deno.test("deleted_at projections are normalized to UTC", () => {
  for (const sql of [SELECT_COLUMNS, SELECT_LIST_COLUMNS]) {
    assertEquals(
      sql.toLowerCase().includes("b.deleted_at at time zone 'utc'"),
      true,
    );
  }
});

Deno.test("transition locks before reading and records exactly once", async () => {
  let projectionReads = 0;
  const { query, calls } = recordingQuery((text) => {
    if (text.includes("for update")) return [{ id: 7 }];
    if (text.includes("record_status_change")) return [];
    if (isProjection(text)) {
      projectionReads++;
      return [barrierRow({
        id: 7,
        availability_id: projectionReads === 1 ? 0 : 4,
      })];
    }
    return [];
  });

  const result = await transitionBarrierStatus(7, 4, 10, "note", query);

  assertStrictEquals(result?.availabilityId, 4);
  assertStrictEquals(calls.length, 4);
  assert(calls[0]!.text.includes("for update"));
  assert(calls[2]!.text.includes("record_status_change"));
  assertEquals(calls[2]!.args, [7, 4, 10, "note"]);
  assertStrictEquals(projectionReads, 2);
});

Deno.test("transition skips the write when the status is unchanged", async () => {
  const { query, calls } = recordingQuery((text) => {
    if (text.includes("for update")) return [{ id: 7 }];
    if (isProjection(text)) {
      return [barrierRow({ id: 7, availability_id: 4 })];
    }
    return [];
  });

  const result = await transitionBarrierStatus(7, 4, 10, "noop", query);

  assertStrictEquals(result?.availabilityId, 4);
  assertStrictEquals(calls.length, 2);
  assertStrictEquals(
    calls.some((call) => call.text.includes("record_status_change")),
    false,
  );
});

Deno.test("updateBarrier merges manual_fields inside the caller query", async () => {
  const { query, calls } = recordingQuery((text) => {
    if (text.includes("for update")) {
      return [{
        tag: "TAG-1",
        location_id: 1,
        typology_id: 1,
        category_id: 1,
        grouping_id: 1,
        owner_id: null,
        criticality_id: 1,
        comments: "old",
        action_plan: "",
        origin: null,
        install_local: null,
        equip_typology: null,
        field_installed: null,
        field_operational: null,
        op_status: null,
        has_maint_plan: null,
        plan_followed: null,
        failure_free: null,
        maint_status: null,
        has_contingency: null,
        contingency_desc: null,
        evidence_code: null,
        degradation_desc: null,
        extra_comments: null,
        manual_fields: ["tag"],
      }];
    }
    if (text.startsWith("update barriers")) return [];
    if (isProjection(text)) {
      return [barrierRow({
        id: 7,
        comments: "new",
        manual_fields: ["comments", "tag"],
      })];
    }
    return [];
  });

  const result = await updateBarrier(7, { comments: "new" }, { query });

  assertStrictEquals(result?.comments, "new");
  assertStrictEquals(calls.length, 3);
  assert(calls[0]!.text.includes("for update"));
  const update = calls.find((call) => call.text.startsWith("update barriers"));
  assert(update, "update statement missing");
  assert(update.text.includes("manual_fields = $3"));
  // id, comments, merged ownership: tag was already owned, comments is new.
  assertEquals(update.args, [7, "new", ["comments", "tag"]]);
});

Deno.test("applyDemotions is one transaction and audits last", async () => {
  const calls: Call[] = [];
  const client: BackfillClient = {
    queryArray(text: string, args: Array<unknown> = []): Promise<unknown> {
      calls.push({ text, args });
      return Promise.resolve(undefined);
    },
  };
  const rows: DegradedBarrierRow[] = [
    { id: 1, external_code: "B-1", availability_id: 4, latest_author: 10 },
    { id: 2, external_code: "B-2", availability_id: 3, latest_author: null },
  ];

  assertStrictEquals(await applyDemotions(client, rows), 2);
  assertStrictEquals(calls[0]!.text, "BEGIN");
  assertStrictEquals(calls.filter((call) => call.text === "BEGIN").length, 1);
  assertStrictEquals(calls.filter((call) => call.text === "COMMIT").length, 1);
  assertStrictEquals(calls.at(-1)!.text, "COMMIT");
  const auditAt = calls.findIndex((call) =>
    call.text.includes("insert into sync_state")
  );
  assertStrictEquals(auditAt, calls.length - 2);
  assertStrictEquals(
    calls.some((call) => call.text === "ROLLBACK"),
    false,
  );
});

Deno.test("applyDemotions rolls everything back when a row fails", async () => {
  const calls: Call[] = [];
  let updates = 0;
  const client: BackfillClient = {
    queryArray(text: string, args: Array<unknown> = []): Promise<unknown> {
      calls.push({ text, args });
      if (text.startsWith("update barriers")) {
        updates++;
        if (updates === 2) {
          return Promise.reject(new Error("boom"));
        }
      }
      return Promise.resolve(undefined);
    },
  };
  const rows: DegradedBarrierRow[] = [
    { id: 1, external_code: "B-1", availability_id: 4, latest_author: 10 },
    { id: 2, external_code: "B-2", availability_id: 3, latest_author: null },
  ];

  await assertRejects(() => applyDemotions(client, rows), Error, "boom");
  assertStrictEquals(calls.at(-1)!.text, "ROLLBACK");
  assertStrictEquals(calls.some((call) => call.text === "COMMIT"), false);
  assertStrictEquals(
    calls.some((call) => call.text.includes("insert into sync_state")),
    false,
  );
});

// --- DB-backed regression tests (self-skip without DATABASE_URL) ----------

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

async function historyCount(barrierId: number): Promise<number> {
  const rows = await queryRows<{ n: number }>(
    `select count(*)::int as n from barrier_status_history
      where barrier_id = $1`,
    [barrierId],
  );
  return Number(rows[0]?.n ?? 0);
}

Deno.test("concurrent transitions append exactly one history row", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const barrier = await firstBarrier();
  if (!barrier) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const other = await queryRows<{ id: number }>(
    `select id from availability_statuses
      where id <> $1 order by id limit 1`,
    [barrier.availability_id],
  );
  if (!other[0]) {
    console.log("skip: need a second availability status");
    return;
  }
  const authorId = await firstAuthorId();
  const target = other[0].id;
  const before = await historyCount(barrier.id);
  try {
    await Promise.all([
      transitionBarrierStatus(barrier.id, target, authorId, "reg-test race a"),
      transitionBarrierStatus(barrier.id, target, authorId, "reg-test race b"),
    ]);
    const after = await historyCount(barrier.id);
    assertStrictEquals(after - before, 1);
    const current = await getBarrierById(barrier.id);
    assertStrictEquals(current?.availabilityId, target);
  } finally {
    const current = await getBarrierById(barrier.id);
    if (current?.availabilityId !== barrier.availability_id) {
      await transitionBarrierStatus(
        barrier.id,
        barrier.availability_id,
        authorId,
        "reg-test cleanup",
      );
    }
  }
});

Deno.test("concurrent manual-field edits keep both owned keys", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const barrier = await firstBarrier();
  if (!barrier) {
    console.log("skip: no barriers to exercise");
    return;
  }
  const original = await getBarrierById(barrier.id);
  if (!original) {
    console.log("skip: barrier vanished");
    return;
  }
  const suffix = String(Date.now());
  try {
    await Promise.all([
      updateBarrier(barrier.id, { comments: `reg-comment-${suffix}` }),
      updateBarrier(barrier.id, { actionPlan: `reg-plan-${suffix}` }),
    ]);
    const after = await getBarrierById(barrier.id);
    assert(after, "barrier vanished mid-test");
    const owned = after.manualFields ?? [];
    assert(owned.includes("comments"));
    assert(owned.includes("actionPlan"));
  } finally {
    const release = ["comments", "actionPlan"].filter((field) =>
      !(original.manualFields ?? []).includes(field)
    );
    await updateBarrier(
      barrier.id,
      { comments: original.comments, actionPlan: original.actionPlan },
      { releaseFields: release },
    );
  }
});
