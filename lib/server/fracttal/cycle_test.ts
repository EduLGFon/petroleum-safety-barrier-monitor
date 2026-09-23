// Unit tests for the multi-scope poll cycle - one shared fetch per cycle,
// sequential scopes, failure isolation, and a stop() that waits in flight.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { SyncFailureInfo } from "./notify.ts";

import type { TimerSource } from "./runner.ts";

import { createCycleLoop } from "./cycle.ts";

import type { SyncResult } from "./sync.ts";

function okResult(scope: string): SyncResult {
  return {
    scope,
    fetchedAt: "2026-09-12T10:00:00.000Z",
    parsed: 1,
    malformed: [],
    mappingSkips: [],
    mappingWarnings: [],
    plan: {
      entries: [],
      counts: { inserts: 1, updates: 0, deletes: 0, skips: 0 },
    },
    written: null,
    runId: 5,
    status: "ok",
  };
}

// ManualTimer: deterministic setTimeout/clearTimeout so the loop is tested
// without wall-clock sleeps (same shape as the runner_test.ts helper).
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

  async fireAll(): Promise<void> {
    const fns = [...this.#handles.values()];
    this.#handles.clear();
    for (const fn of fns) await fn();
  }
}

// flushCycle yields to the event loop until the background cycle logs its
// terminal line. The timer callback is fire-and-forget by design (the next
// cycle chains after completion), so headless tests cannot await the tick
// itself - they wait for the observable outcome instead, with a bounded
// spin so a hung cycle fails instead of hanging the suite.
async function flushCycle(lines: string[]): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (
      lines.some((l) =>
        l.startsWith("[cycle] done") || l.startsWith("[cycle] shared fetch")
      )
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("cycle did not finish");
}

Deno.test("createCycleLoop fetches shared once and runs scopes in order", async () => {
  const timers = new ManualTimer();
  const lines: string[] = [];
  const order: string[] = [];
  let sharedCalls = 0;
  const seenShared: string[] = [];
  const loop = createCycleLoop<string>({
    scopes: ["a", "b", "c"].map((scope) => ({
      scope,
      run: (s, shared) => {
        order.push(s);
        seenShared.push(shared);
        return Promise.resolve(okResult(s));
      },
    })),
    fetchShared: () => {
      sharedCalls++;
      return Promise.resolve("work");
    },
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [],
    intervalMs: 1000,
    timers,
    onLog: (line) => lines.push(line),
  });
  loop.start();
  await timers.fireAll();
  await flushCycle(lines);
  await loop.stop(); // no-op after completion; proves stop-after-done is safe
  assertStrictEquals(sharedCalls, 1);
  assertStrictEquals(order.join(","), "a,b,c");
  assertStrictEquals(seenShared.join(","), "work,work,work");
  assertStrictEquals(lines.some((l) => l.startsWith("[cycle] done")), true);
});

Deno.test("createCycleLoop isolates a scope failure and notifies", async () => {
  const timers = new ManualTimer();
  const lines: string[] = [];
  const order: string[] = [];
  const seen: SyncFailureInfo[] = [];
  const loop = createCycleLoop<string>({
    scopes: [
      {
        scope: "a",
        run: () => Promise.reject(new Error("boom-a")),
      },
      {
        scope: "b",
        run: (s) => {
          order.push(s);
          return Promise.resolve(okResult(s));
        },
      },
    ],
    fetchShared: () => Promise.resolve("work"),
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [{
      name: "test",
      syncFailed(i: SyncFailureInfo) {
        seen.push(i);
        return Promise.resolve();
      },
    }],
    intervalMs: 1000,
    timers,
    onLog: (line) => lines.push(line),
  });
  loop.start();
  await timers.fireAll();
  await flushCycle(lines);
  await loop.stop();
  assertStrictEquals(order.join(","), "b");
  assertStrictEquals(seen.length, 1);
  assertStrictEquals(seen[0]!.scope, "a");
  assertStrictEquals(seen[0]!.note.includes("boom-a"), true);
});

Deno.test("createCycleLoop notifies once when the shared fetch fails", async () => {
  const timers = new ManualTimer();
  const lines: string[] = [];
  let runs = 0;
  const seen: SyncFailureInfo[] = [];
  const loop = createCycleLoop<string>({
    scopes: [{
      scope: "a",
      run: () => {
        runs++;
        return Promise.resolve(okResult("a"));
      },
    }],
    fetchShared: () => Promise.reject(new Error("wo down")),
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [{
      name: "test",
      syncFailed(i: SyncFailureInfo) {
        seen.push(i);
        return Promise.resolve();
      },
    }],
    intervalMs: 1000,
    timers,
    onLog: (line) => lines.push(line),
  });
  loop.start();
  await timers.fireAll();
  await flushCycle(lines);
  await loop.stop();
  assertStrictEquals(runs, 0);
  assertStrictEquals(seen.length, 1);
  assertStrictEquals(seen[0]!.scope, "cycle");
  assertStrictEquals(seen[0]!.note.includes("wo down"), true);
});

Deno.test("createCycleLoop skips a locked scope without running it", async () => {
  const timers = new ManualTimer();
  const lines: string[] = [];
  let runs = 0;
  const loop = createCycleLoop<string>({
    scopes: [{
      scope: "a",
      run: () => {
        runs++;
        return Promise.resolve(okResult("a"));
      },
    }],
    fetchShared: () => Promise.resolve("work"),
    lock: { isRunning: () => Promise.resolve(true) },
    notifiers: [],
    intervalMs: 1000,
    timers,
    onLog: (line) => lines.push(line),
  });
  loop.start();
  await timers.fireAll();
  await flushCycle(lines);
  await loop.stop();
  assertStrictEquals(runs, 0);
  assertStrictEquals(lines.some((l) => l.includes("scope=a skipped")), true);
});

Deno.test("createCycleLoop stop() waits for the in-flight scope", async () => {
  const timers = new ManualTimer();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loop = createCycleLoop<string>({
    scopes: [{
      scope: "a",
      run: async (s) => {
        await gate;
        return okResult(s);
      },
    }],
    fetchShared: () => Promise.resolve("work"),
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [],
    intervalMs: 1000,
    timers,
    onLog: () => {},
  });
  loop.start();
  await timers.fireAll();
  const done: boolean[] = [];
  const stopping = loop.stop().then(() => done.push(true));
  assertStrictEquals(done.length, 0);
  release();
  await stopping;
  assertStrictEquals(done.length, 1);
});

Deno.test("createCycleLoop records shared-fetch failures via onCycleFailure", async () => {
  const timers = new ManualTimer();
  const lines: string[] = [];
  const recorded: { scope: string; note: string }[] = [];
  const loop = createCycleLoop<string>({
    scopes: [{
      scope: "a",
      run: (s) => Promise.resolve(okResult(s)),
    }],
    fetchShared: () => Promise.reject(new Error("wo down")),
    lock: { isRunning: () => Promise.resolve(false) },
    notifiers: [],
    intervalMs: 1000,
    cycleScope: "test-cycle",
    onCycleFailure: (info) => {
      recorded.push({ scope: info.scope, note: info.note });
      return Promise.resolve();
    },
    timers,
    onLog: (line) => lines.push(line),
  });
  loop.start();
  await timers.fireAll();
  await flushCycle(lines);
  await loop.stop();
  assertStrictEquals(recorded.length, 1);
  assertStrictEquals(recorded[0]!.scope, "test-cycle");
  assertStrictEquals(recorded[0]!.note.includes("wo down"), true);
});
