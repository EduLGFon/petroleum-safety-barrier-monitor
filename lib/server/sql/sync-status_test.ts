// Unit tests for the sync status indicator state decision (pure mapper),
// plus a read-only DB shape check (no writes, so no cleanup needed).
import {
  getSyncStatus,
  isStaleActive,
  recordSyncFailure,
  type SyncStatusRow,
  toSyncStatus,
} from "./sync.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import { queryRows } from "../db.ts";

function row(over: Partial<SyncStatusRow> = {}): SyncStatusRow {
  return {
    id: 7,
    scope: "fracttal-live:all",
    status: "ok",
    inserts: 1,
    updates: 2,
    deletes: 0,
    skips: 3,
    note: "parsed=10",
    started_at: "2026-09-20T10:00:00.000Z",
    finished_at: "2026-09-20T10:05:00.000Z",
    ...over,
  };
}

Deno.test("toSyncStatus reports syncing while a fresh run is in flight", () => {
  const status = toSyncStatus({
    latest: row(),
    running: {
      scope: "fracttal-live:all",
      started_at: "2026-09-20T10:06:00.000Z",
    },
    staleRunning: false,
    barriers: 3515,
  });
  assertStrictEquals(status.state, "syncing");
  assertStrictEquals(status.runningSince, "2026-09-20T10:06:00.000Z");
  assertStrictEquals(status.lastRun?.scope, "fracttal-live:all");
  assertStrictEquals(status.totals.barriers, 3515);
});

Deno.test("toSyncStatus reports idle on the latest finished run", () => {
  const status = toSyncStatus({
    latest: row({ status: "failed", note: "boom" }),
    running: null,
    staleRunning: false,
    barriers: 10,
  });
  assertStrictEquals(status.state, "idle");
  assertStrictEquals(status.lastRun?.status, "failed");
  assertStrictEquals(status.lastRun?.note, "boom");
});

Deno.test("toSyncStatus reports stale on a stuck running row", () => {
  const status = toSyncStatus({
    latest: row(),
    running: null,
    staleRunning: true,
    barriers: 10,
  });
  assertStrictEquals(status.state, "stale");
  assertStrictEquals(status.runningSince, null);
});

Deno.test("toSyncStatus reports unknown on an empty table", () => {
  const status = toSyncStatus({
    latest: null,
    running: null,
    staleRunning: false,
    barriers: 0,
  });
  assertStrictEquals(status.state, "unknown");
  assertStrictEquals(status.lastRun, null);
});

Deno.test("isStaleActive ignores orphans superseded by newer finished runs", () => {
  const latest = row({ id: 620, finished_at: "2026-09-25T18:13:51.000Z" });
  // Prod case: run 569 orphaned at 13:11, later ok runs through 620 kept
  // landing - must not latch stale.
  assertStrictEquals(
    isStaleActive({ id: 569, started_at: "2026-09-25T13:11:12.000Z" }, latest),
    false,
  );
  // A genuinely stuck current run (newer than the last finish) stays stale.
  assertStrictEquals(
    isStaleActive({ id: 621, started_at: "2026-09-25T18:20:00.000Z" }, latest),
    true,
  );
  assertStrictEquals(isStaleActive(null, latest), false);
  assertStrictEquals(
    isStaleActive({ id: 1, started_at: latest.finished_at }, null),
    true,
  );
});

Deno.test("getSyncStatus returns the indicator shape read-only", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const status = await getSyncStatus();
  assertStrictEquals(
    ["syncing", "idle", "stale", "unknown"].includes(status.state),
    true,
  );
  assertStrictEquals(typeof status.totals.barriers, "number");
  if (status.lastRun !== null) {
    assertStrictEquals(typeof status.lastRun.scope, "string");
    assertStrictEquals(typeof status.lastRun.finishedAt, "string");
  }
});

Deno.test("recordSyncFailure persists a visible failed row", async () => {
  if (!Deno.env.get("DATABASE_URL")) {
    console.log("skip: DATABASE_URL unset - needs a real Postgres");
    return;
  }
  const scope = "test-cycle-probe";
  try {
    await recordSyncFailure(scope, "probe failure");
    const rows = await queryRows<{ status: string; note: string }>(
      `select status, note from sync_state
       where scope = $1 order by id desc limit 1`,
      [scope],
    );
    assertStrictEquals(rows[0]?.status, "failed");
    assertStrictEquals(rows[0]?.note.includes("probe failure"), true);
  } finally {
    await queryRows(`delete from sync_state where scope = $1`, [scope]);
  }
});
