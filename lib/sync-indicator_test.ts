// Unit tests for the merged sync indicator model (pure mapper).
// This is why they exist: dot precedence and local instant formatting
// must stay deterministic across timezones without a browser.
import {
  formatDuration,
  formatInstant,
  friendlyScope,
  healthLabel,
  toDeltas,
  toHealthKind,
} from "./sync-indicator.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { SyncStatus } from "./types.ts";

function sync(over: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state: "idle",
    runningSince: null,
    lastRun: {
      scope: "fracttal-live:all",
      status: "ok",
      startedAt: "2026-09-22T10:00:00.000Z",
      finishedAt: "2026-09-22T10:05:00.000Z",
      inserts: 3,
      updates: 12,
      deletes: 1,
      skips: 0,
      note: "",
    },
    totals: { barriers: 100 },
    ...over,
  };
}

Deno.test("toDeltas sums changed items", () => {
  const d = toDeltas(sync().lastRun);
  assertStrictEquals(d?.changed, 16);
  assertStrictEquals(d?.net, 2);
  assertStrictEquals(toDeltas(null), null);
});

// NOW_FRESH is 5 minutes after the fixture run (healthy cadence);
// NOW_STALE is 14 hours after it (the dead-poller report).
const NOW_FRESH = new Date("2026-09-22T10:10:00.000Z").getTime();
const NOW_STALE = new Date("2026-09-23T00:05:00.000Z").getTime();

Deno.test("toHealthKind prefers offline over sync state", () => {
  assertStrictEquals(
    toHealthKind(sync(), "disconnected", NOW_FRESH),
    "offline",
  );
  assertStrictEquals(toHealthKind(sync(), "connected", NOW_FRESH), "synced");
  assertStrictEquals(toHealthKind(null, "connected", NOW_FRESH), "never");
});

Deno.test("toHealthKind surfaces syncing, failed and stale", () => {
  assertStrictEquals(
    toHealthKind(sync({ state: "syncing" }), "connected", NOW_FRESH),
    "syncing",
  );
  assertStrictEquals(
    toHealthKind(
      sync({ lastRun: { ...sync().lastRun!, status: "failed" } }),
      "connected",
      NOW_FRESH,
    ),
    "failed",
  );
  assertStrictEquals(
    toHealthKind(sync({ state: "stale" }), "connected", NOW_FRESH),
    "stale",
  );
});

Deno.test("toHealthKind flags an aging ok run as outdated", () => {
  assertStrictEquals(
    toHealthKind(sync(), "connected", NOW_STALE),
    "outdated",
  );
  assertStrictEquals(healthLabel("outdated"), "Sincronização desatualizada");
});

Deno.test("toHealthKind keeps failure signals above outdated", () => {
  const failed = sync({
    lastRun: { ...sync().lastRun!, status: "failed" },
  });
  assertStrictEquals(toHealthKind(failed, "connected", NOW_STALE), "failed");
  assertStrictEquals(
    toHealthKind(sync({ state: "stale" }), "connected", NOW_STALE),
    "stale",
  );
  assertStrictEquals(
    toHealthKind(sync({ state: "syncing" }), "connected", NOW_STALE),
    "syncing",
  );
});

Deno.test("toHealthKind never downgrades a malformed timestamp", () => {
  const broken = sync({
    lastRun: { ...sync().lastRun!, finishedAt: "not-a-date" },
  });
  assertStrictEquals(toHealthKind(broken, "connected", NOW_STALE), "synced");
});

Deno.test("formatInstant renders pt-BR date and time parts", () => {
  const parts = formatInstant("2026-09-22T10:05:00.000Z");
  assertStrictEquals(parts !== null, true);
  assertStrictEquals(parts?.date.includes("/"), true);
  assertStrictEquals(parts?.time.includes(":"), true);
  assertStrictEquals(formatInstant(null), null);
});

Deno.test("formatDuration resolves down to milliseconds", () => {
  assertStrictEquals(
    formatDuration("2026-09-22T10:00:00.000Z", "2026-09-22T10:00:00.450Z"),
    "450 ms",
  );
  assertStrictEquals(
    formatDuration("2026-09-22T10:00:00.000Z", "2026-09-22T10:00:08.320Z"),
    "8 s 320 ms",
  );
  assertStrictEquals(
    formatDuration("2026-09-22T10:00:00.000Z", "2026-09-22T10:02:14.000Z"),
    "2 min 14 s",
  );
  assertStrictEquals(
    formatDuration("not-a-date", "2026-09-22T10:00:00.000Z"),
    "-",
  );
});

Deno.test("friendlyScope names known scopes and prettifies the rest", () => {
  assertStrictEquals(
    friendlyScope("fracttal-live:all"),
    "Fracttal - todas as instalações",
  );
  assertStrictEquals(friendlyScope("dump-import"), "Importação de arquivo");
  assertStrictEquals(
    friendlyScope("nightly_custom-scope"),
    "nightly custom scope",
  );
});
