// Unit tests for the reconcile planner + runSync orchestrator (P3). The
// planner is pure so these run headless; runSync gets an injected fake io.
import {
  assertCompletePage,
  buildRunNote,
  fieldsSignature,
  type LocalBarrier,
  type PlanCounts,
  type PlanEntry,
  planReconcile,
  runSync,
  type SyncIo,
} from "./sync.ts";

import { assertStrictEquals, assertStringIncludes } from "jsr:@std/assert@^1";

import type { MapContext, SyncBarrierInput } from "./map.ts";

const ctx: MapContext = {
  locationIds: { FAL: 1, SM: 2 },
  categoryIds: { "Sistema de Combate a Incêndio": 7 },
  criticalityIds: { "Crítico": 1 },
};

function baseInput(over: Partial<SyncBarrierInput> = {}): SyncBarrierInput {
  return {
    externalCode: "FAL-EQ-001",
    tag: "FAL-EQ-001",
    locationId: 1,
    typologyId: 3,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 7,
    groupingId: 0,
    ownerId: null,
    availabilityId: 0,
    comments: "",
    actionPlan: "",
    sourceUpdatedAt: null,
    ...over,
  };
}

function localRow(over: Partial<LocalBarrier> = {}): LocalBarrier {
  const base: LocalBarrier = {
    id: 10,
    externalCode: "FAL-EQ-001",
    availabilityId: 0,
    deletedAt: null,
    signature: fieldsSignature(baseInput()),
  };
  return { ...base, ...over };
}

const kinds = (plan: { entries: PlanEntry[] }) =>
  plan.entries.map((e) => e.kind).sort();

Deno.test("assertCompletePage throws on truncated pages", () => {
  let caught: Error | null = null;
  try {
    assertCompletePage(["a"], 3, "FAL");
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(caught!.message.includes("truncated page"), true);
  assertStrictEquals(caught!.message.includes("FAL"), true);
});

Deno.test("assertCompletePage passes on full and unknown totals", () => {
  assertCompletePage(["a", "b"], 2, "FAL");
  assertCompletePage(["a"], null, "FAL");
  assertCompletePage([], 0, "FAL");
});

Deno.test("planReconcile inserts rows not yet local", () => {
  const plan = planReconcile([baseInput()], []);
  assertStrictEquals(plan.counts.inserts, 1);
  assertStrictEquals(kinds(plan).join(","), "insert");
});

Deno.test("planReconcile skips unchanged rows", () => {
  const local = [localRow()];
  const plan = planReconcile([baseInput()], local);
  assertStrictEquals(plan.counts.skips, 1);
  assertStrictEquals(kinds(plan).join(","), "skip");
});

Deno.test("planReconcile updates on signature change", () => {
  const local = [localRow()];
  const plan = planReconcile([baseInput({ tag: "FAL-EQ-001-v2" })], local);
  const entry = plan.entries[0];
  assertStrictEquals(entry.kind, "update");
  if (entry.kind !== "update") throw new Error("unreachable");
  assertStrictEquals(entry.statusChanged, false);
});

Deno.test("planReconcile flags statusChanged when availability flips", () => {
  const local = [localRow()];
  const plan = planReconcile([baseInput({ availabilityId: 5 })], local);
  const entry = plan.entries[0];
  assertStrictEquals(entry.kind, "update");
  if (entry.kind !== "update") throw new Error("unreachable");
  assertStrictEquals(entry.statusChanged, true);
});

Deno.test("planReconcile restores a deleted row reappearing upstream", () => {
  const local = [localRow({ deletedAt: "2026-09-01T00:00:00Z" })];
  const plan = planReconcile([baseInput()], local);
  const entry = plan.entries[0];
  assertStrictEquals(entry.kind, "restore");
  if (entry.kind !== "restore") throw new Error("unreachable");
  assertStrictEquals(entry.statusChanged, false);
});

Deno.test("planReconcile restores with statusChanged on a deleted status flip", () => {
  const local = [localRow({ deletedAt: "2026-09-01T00:00:00Z" })];
  const plan = planReconcile([baseInput({ availabilityId: 5 })], local);
  const entry = plan.entries[0];
  assertStrictEquals(entry.kind, "restore");
  if (entry.kind !== "restore") throw new Error("unreachable");
  assertStrictEquals(entry.statusChanged, true);
});

Deno.test("planReconcile soft-deletes only non-deleted scoped locals", () => {
  const ghost = localRow({
    id: 11,
    externalCode: "FAL-EQ-GHOST",
    signature: fieldsSignature(baseInput({ externalCode: "FAL-EQ-GHOST" })),
  });
  const gone = localRow({
    id: 12,
    externalCode: "FAL-EQ-GONE",
    deletedAt: "2026-09-01T00:00:00Z",
    signature: fieldsSignature(baseInput({ externalCode: "FAL-EQ-GONE" })),
  });
  const plan = planReconcile([baseInput()], [ghost, gone]);
  // FAL-EQ-001 inserts (no local), the live stray soft-deletes, and the gone
  // row that is already deleted stays untouched.
  assertStrictEquals(kinds(plan).join(","), "delete,insert");
  assertStrictEquals(plan.counts.deletes, 1);
  assertStrictEquals(plan.counts.inserts, 1);
});

Deno.test("countPlan totals a mixed plan", () => {
  const plan = planReconcile(
    [baseInput(), baseInput({ externalCode: "C2" })],
    [
      localRow(),
      localRow({
        id: 12,
        externalCode: "C3",
        signature: fieldsSignature(baseInput({ externalCode: "C3" })),
      }),
    ],
  );
  assertStrictEquals(plan.counts.inserts, 1);
  assertStrictEquals(plan.counts.updates, 0);
  assertStrictEquals(plan.counts.deletes, 1);
  assertStrictEquals(plan.counts.skips, 1);
});

// ---- runSync with an injected fake io ----

interface FakeIoState {
  calls: {
    startRun: string[];
    applyPlan: Array<{ entries: PlanEntry[]; counts: PlanCounts }>;
    finishRun: Array<{ status: string; counts: PlanCounts; note: string }>;
  };
  local: LocalBarrier[];
  nextRunId: number;
}

function makeFakeIo(): { io: SyncIo; state: FakeIoState } {
  const state: FakeIoState = {
    calls: { startRun: [], applyPlan: [], finishRun: [] },
    local: [],
    nextRunId: 1,
  };
  // SyncIo methods are non-async here: returning an explicit promise avoids
  // Deno's require-await lint on a synchronous fake.
  const io: SyncIo = {
    buildMapContext(): Promise<MapContext> {
      return Promise.resolve(ctx);
    },
    loadLocal(): Promise<LocalBarrier[]> {
      return Promise.resolve(state.local);
    },
    startRun(scope: string): Promise<number> {
      state.calls.startRun.push(scope);
      return Promise.resolve(state.nextRunId++);
    },
    applyPlan(entries: PlanEntry[]): Promise<PlanCounts> {
      const counts: PlanCounts = {
        inserts: entries.filter((e) => e.kind === "insert").length,
        updates:
          entries.filter((e) => e.kind === "update" || e.kind === "restore")
            .length,
        deletes: entries.filter((e) => e.kind === "delete").length,
        skips: entries.filter((e) => e.kind === "skip").length,
      };
      state.calls.applyPlan.push({ entries, counts });
      return Promise.resolve(counts);
    },
    finishRun(_runId: number, status, counts, note): Promise<void> {
      state.calls.finishRun.push({ status, counts, note });
      return Promise.resolve();
    },
  };
  return { io, state };
}

function rawRow(over: Record<string, unknown> = {}): unknown {
  return {
    id: 42,
    code: "FAL-EQ-001",
    active: true,
    available: true,
    id_type_item: 2,
    description: "teste",
    location_code: "FAL",
    items_types_description: "Equipment",
    groups_1_description: "Polo Cricaré",
    groups_description: "Sistema de Combate a Incêndio",
    priorities_description: "Crítico",
    ...over,
  };
}

Deno.test("runSync dry-run writes nothing and reports the plan", async () => {
  const { io, state } = makeFakeIo();
  const result = await runSync(() => Promise.resolve([rawRow()]), {
    io,
    dryRun: true,
  });
  assertStrictEquals(result.status, "ok");
  assertStrictEquals(result.runId, null);
  assertStrictEquals(result.parsed, 1);
  assertStrictEquals(result.malformed.length, 0);
  assertStrictEquals(result.mappingSkips.length, 0);
  assertStrictEquals(result.plan.counts.inserts, 1);
  assertStrictEquals(result.written, null);
  assertStrictEquals(state.calls.startRun.length, 0);
  assertStrictEquals(state.calls.applyPlan.length, 0);
  assertStrictEquals(state.calls.finishRun.length, 0);
});

Deno.test("runSync applies the plan and records an ok audit row", async () => {
  const { io, state } = makeFakeIo();
  const result = await runSync(() => Promise.resolve([rawRow()]), {
    io,
    dryRun: false,
    scope: "synthetic:test",
  });
  assertStrictEquals(state.calls.startRun.join(","), "synthetic:test");
  assertStrictEquals(state.calls.applyPlan.length, 1);
  assertStrictEquals(state.calls.applyPlan[0]!.counts.inserts, 1);
  const finish = state.calls.finishRun[0]!;
  assertStrictEquals(finish.status, "ok");
  assertStrictEquals(finish.counts.inserts, 1);
  assertStrictEquals(result.written?.inserts, 1);
  assertStrictEquals(result.runId, 1);
});

Deno.test("runSync counts malformed and mapping skips as skips on audit", async () => {
  const { io, state } = makeFakeIo();
  const rows = [
    rawRow(),
    rawRow({ id: 43, code: 123 }), // malformed: code not a string
    rawRow({ id: 44, code: "ZZZ-1", location_code: "ZZZ" }), // unknown location
  ];
  await runSync(() => Promise.resolve(rows), { io, dryRun: false });
  const finish = state.calls.finishRun[0]!;
  assertStrictEquals(finish.status, "ok");
  assertStrictEquals(finish.counts.inserts, 1);
  assertStrictEquals(finish.counts.skips, 2);
});

Deno.test("runSync applies work events to availability and comments", async () => {
  const { io, state } = makeFakeIo();
  const result = await runSync(() => Promise.resolve([rawRow()]), {
    io,
    dryRun: false,
    workEvents: (code) =>
      code === "FAL-EQ-001"
        ? {
          urgent: null,
          planned: { date: "2026-09-11", source: "OS - 7" },
          stopAssets: false,
        }
        : null,
  });
  assertStrictEquals(result.plan.counts.inserts, 1);
  const entry = state.calls.applyPlan[0]!.entries[0]!;
  assertStrictEquals(entry.kind, "insert");
  if (entry.kind !== "insert") throw new Error("unreachable");
  assertStrictEquals(entry.input.availabilityId, 4);
  assertStrictEquals(entry.input.comments, "OS - 7");
  assertStrictEquals(entry.input.sourceUpdatedAt, "2026-09-11");
});

Deno.test("runSync fails closed when work events throw", async () => {
  const { io, state } = makeFakeIo();
  let caught: Error | null = null;
  try {
    await runSync(() => Promise.resolve([rawRow()]), {
      io,
      dryRun: false,
      workEvents: () => {
        throw new Error("wo down");
      },
    });
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(state.calls.applyPlan.length, 0);
  const finish = state.calls.finishRun[0]!;
  assertStrictEquals(finish.status, "failed");
});

Deno.test("runSync reconciles a station move as an update, never a delete", async () => {
  const moved = localRow({ id: 11, externalCode: "FAL-EQ-002" });
  const seen: { scopeIds: number[][]; codes: string[][] } = {
    scopeIds: [],
    codes: [],
  };
  const { io } = makeFakeIo();
  const filteringIo: SyncIo = {
    ...io,
    loadLocal(scopeIds, codes) {
      seen.scopeIds.push(scopeIds);
      seen.codes.push(codes);
      return Promise.resolve([moved]);
    },
  };
  const rows = [
    rawRow(),
    rawRow({
      id: 43,
      code: "FAL-EQ-002",
      parent_description:
        "// Seacrest Petróleo/ Área Norte/ SÃO MATEUS - SM/ X",
    }),
  ];
  const result = await runSync(() => Promise.resolve(rows), {
    io: filteringIo,
    dryRun: true,
  });
  // The loader receives both the scope stations and the remote codes, so a
  // row that moved stations is matched by code instead of stranded.
  assertStrictEquals(
    seen.scopeIds.map((ids) => ids.join(",")).join(";"),
    "1,2",
  );
  assertStrictEquals(
    seen.codes.map((codes) => codes.join(",")).join(";"),
    "FAL-EQ-001,FAL-EQ-002",
  );
  assertStrictEquals(result.plan.counts.inserts, 1);
  assertStrictEquals(result.plan.counts.updates, 1);
  assertStrictEquals(result.plan.counts.deletes, 0);
});

Deno.test("runSync starts the audit run before fetching rows", async () => {
  const { io } = makeFakeIo();
  const order: string[] = [];
  const orderedIo: SyncIo = {
    ...io,
    startRun(scope: string): Promise<number> {
      order.push(`start:${scope}`);
      return io.startRun(scope);
    },
  };
  await runSync(() => {
    order.push("source");
    return Promise.resolve([rawRow()]);
  }, { io: orderedIo, dryRun: false, scope: "s" });
  // The running row (and the overlap lock window) must cover the fetch,
  // not just the DB phase, or the indicator never shows syncing.
  assertStrictEquals(order.join(","), "start:s,source");
});

Deno.test("runSync records a failed run and rethrows with the [sync] prefix", async () => {
  const { io, state } = makeFakeIo();
  let caught: Error | null = null;
  try {
    await runSync(
      () => {
        throw new Error("boom");
      },
      { io, dryRun: false },
    );
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(
    caught!.message.includes("[sync] boom"),
    true,
    caught?.message,
  );
  const finish = state.calls.finishRun[0]!;
  assertStrictEquals(finish.status, "failed");
  assertStrictEquals(finish.note, "boom");
  assertStrictEquals(finish.counts.inserts, 0);
  assertStrictEquals(finish.counts.skips, 0);
});

Deno.test("buildRunNote summarizes counts and the first skips", () => {
  const note = buildRunNote({
    parsed: 3,
    malformed: 1,
    mappingSkips: [
      { code: "A", reason: "unknown station 'ZZZ'" },
      { code: "B", reason: "not barrier scope" },
    ],
    mappingWarnings: 2,
    counts: { inserts: 1, updates: 0, deletes: 0, skips: 0 },
  });
  assertStringIncludes(note, "parsed=3 malformed=1 mapSkips=2 warnings=2");
  assertStringIncludes(note, "plan i:1 u:0 d:0 s:0");
  assertStringIncludes(note, "A (unknown station 'ZZZ')");
});

Deno.test("buildRunNote caps at 500 chars", () => {
  const note = buildRunNote({
    parsed: 1,
    malformed: 0,
    mappingSkips: Array.from(
      { length: 20 },
      (_, i) => ({ code: `C${i}`, reason: "x".repeat(100) }),
    ),
    mappingWarnings: 0,
    counts: { inserts: 0, updates: 0, deletes: 0, skips: 0 },
  });
  assertStrictEquals(note.length <= 500, true);
  assertStrictEquals(note.endsWith("..."), true);
});

Deno.test("runSync persists a summary note on ok runs", async () => {
  const { io, state } = makeFakeIo();
  const rows = [
    rawRow(),
    rawRow({ id: 44, code: "ZZZ-1", location_code: "ZZZ" }),
  ];
  await runSync(() => Promise.resolve(rows), { io, dryRun: false });
  const finish = state.calls.finishRun[0]!;
  assertStrictEquals(finish.status, "ok");
  assertStringIncludes(finish.note, "parsed=2");
  assertStringIncludes(finish.note, "mapSkips=1");
  assertStringIncludes(finish.note, "ZZZ-1");
});
