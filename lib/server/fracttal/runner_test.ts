// Unit tests for the polling runner (P3) - lock, notify-on-failure, and a
// stop-safe cadence loop with injectable timers.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { createPollLoop, pollOnce, type TimerSource } from "./runner.ts";
import type { SyncResult } from "./sync.ts";
import type { SyncFailureInfo } from "./notify.ts";

function okResult(): SyncResult {
  return {
    scope: "s",
    fetchedAt: "2026-09-12T10:00:00.000Z",
    parsed: 1,
    malformed: [],
    mappingSkips: [],
    plan: {
      entries: [],
      counts: { inserts: 1, updates: 0, deletes: 0, skips: 0 },
    },
    written: null,
    runId: 5,
    status: "ok",
  };
}

Deno.test("pollOnce skips when the scope lock is held", async () => {
  let runs = 0;
  const outcome = await pollOnce("s", {
    run: () => {
      runs++;
      return Promise.resolve(okResult());
    },
    lock: { isRunning: () => Promise.resolve(true) },
    notifier: { syncFailed: () => Promise.resolve() },
  });
  assertStrictEquals(outcome.outcome, "skipped");
  assertStrictEquals(runs, 0);
});

Deno.test("pollOnce reports ok with the audit runId", async () => {
  const outcome = await pollOnce("s", {
    run: () => Promise.resolve(okResult()),
    lock: { isRunning: () => Promise.resolve(false) },
    notifier: { syncFailed: () => Promise.resolve() },
  });
  assertStrictEquals(outcome.outcome, "ok");
  if (outcome.outcome !== "ok") throw new Error("unreachable");
  assertStrictEquals(outcome.runId, 5);
});

Deno.test("pollOnce notifies ops with the failure details", async () => {
  const seen: SyncFailureInfo[] = [];
  const fixedNow = new Date("2026-09-12T10:00:00.000Z");
  const outcome = await pollOnce("s", {
    run: () => {
      throw new Error("boom");
    },
    lock: { isRunning: () => Promise.resolve(false) },
    notifier: {
      syncFailed(i: SyncFailureInfo) {
        seen.push(i);
        return Promise.resolve();
      },
    },
    now: () => fixedNow,
  });
  assertStrictEquals(outcome.outcome, "failed");
  assertStrictEquals(seen.length, 1);
  assertStrictEquals(seen[0]!.scope, "s");
  assertStrictEquals(seen[0]!.note, "boom");
  assertStrictEquals(seen[0]!.startedAt, "2026-09-12T10:00:00.000Z");
});

// ManualTimer: deterministic setTimeout/clearTimeout so the loop is tested
// without wall-clock sleeps.
class ManualTimer implements TimerSource {
  #next = 1;
  #handles = new Map<number, () => void | Promise<void>>();

  setTimeout(fn: () => void | Promise<void>): number {
    const id = this.#next++;
    this.#handles.set(id, fn);
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.#handles.delete(handle as number);
  }

  get pending(): number {
    return this.#handles.size;
  }

  async fireAll(): Promise<void> {
    const fns = [...this.#handles.values()];
    this.#handles.clear();
    for (const fn of fns) await fn();
  }
}

Deno.test("createPollLoop ticks on cadence and stop() halts it", async () => {
  const timers = new ManualTimer();
  let runs = 0;
  const loop = createPollLoop("s", {
    run: () => {
      runs++;
      return Promise.resolve(okResult());
    },
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [],
    intervalMs: 1000,
    timers,
    onLog: () => {},
  });
  loop.start();
  assertStrictEquals(timers.pending, 1);
  await timers.fireAll();
  assertStrictEquals(runs, 1);
  await timers.fireAll();
  assertStrictEquals(runs, 2);

  await loop.stop();
  await timers.fireAll();
  assertStrictEquals(runs, 2);
  assertStrictEquals(timers.pending, 0);
});

Deno.test("createPollLoop keeps cadence after a cron crash (lock failure)", async () => {
  const timers = new ManualTimer();
  let failed = false;
  let runs = 0;
  const loop = createPollLoop("s", {
    run: () => {
      runs++;
      return Promise.resolve(okResult());
    },
    lock: {
      isRunning() {
        if (!failed) {
          failed = true;
          throw new Error("lock query down");
        }
        return Promise.resolve(false);
      },
    },
    notifiers: [],
    intervalMs: 1000,
    timers,
    onLog: () => {},
  });
  loop.start();
  await timers.fireAll();
  assertStrictEquals(runs, 0); // the crash happened before the run
  assertStrictEquals(timers.pending, 1); // rescheduled anyway
  await timers.fireAll();
  assertStrictEquals(runs, 1);
  await loop.stop();
});

Deno.test("createPollLoop reports failures through the notifiers", async () => {
  const timers = new ManualTimer();
  const seen: string[] = [];
  const loop = createPollLoop("s", {
    run: () => {
      throw new Error("boom");
    },
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [{
      name: "test",
      syncFailed(i: SyncFailureInfo) {
        seen.push(i.note);
        return Promise.resolve();
      },
    }],
    intervalMs: 1000,
    timers,
    onLog: () => {},
  });
  loop.start();
  await timers.fireAll();
  assertStrictEquals(seen.join(","), "boom");
  await loop.stop();
});
