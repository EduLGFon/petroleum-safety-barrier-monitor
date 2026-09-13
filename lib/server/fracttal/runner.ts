// Polling runner for the sync pipeline (P3) - "polling first".
// This is why it exists: SPRINTS P3 targets a poll cadence before webhooks.
// pollOnce drives one scope through lock -> run -> notify-on-failure so runs
// never overlap and failures are never silent; createPollLoop keeps that
// cadence with start/stop semantics (stop is safe mid-run).
import type { OpsNotifier, SyncFailureInfo } from "./notify.ts";

import { notifyFailureToAll } from "./notify.ts";

import type { SyncResult } from "./sync.ts";

export interface ScopeLock {
  isRunning(scope: string): Promise<boolean>;
}

export interface PollNotifier {
  syncFailed(info: SyncFailureInfo): Promise<void>;
}

export type PollOutcome =
  | { scope: string; outcome: "ok"; runId: number | null }
  | { scope: string; outcome: "skipped" }
  | { scope: string; outcome: "failed"; note: string };

// pollOnce: one lock-checked, failure-notified sync attempt for a scope.
export async function pollOnce(
  scope: string,
  opts: {
    run: (scope: string) => Promise<SyncResult>;
    lock: ScopeLock;
    notifier: PollNotifier;
    now?: () => Date;
  },
): Promise<PollOutcome> {
  const now = opts.now ?? (() => new Date());
  if (await opts.lock.isRunning(scope)) {
    return { scope, outcome: "skipped" };
  }
  try {
    const result = await opts.run(scope);
    return { scope, outcome: "ok", runId: result.runId };
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    await opts.notifier.syncFailed({
      scope,
      startedAt: now().toISOString(),
      note,
      runId: null,
    });
    return { scope, outcome: "failed", note };
  }
}

// TimerSource: injectable timers so the loop is testable without sleeps.
export interface TimerSource {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const defaultTimerSource: TimerSource = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as number),
};

export interface PollLoop {
  start(): void;
  stop(): Promise<void>;
}

// createPollLoop: fires pollOnce for one scope every intervalMs until stop().
// A crashing poll (lock failure, notifier logic) is logged and the cadence
// continues - a poll loop must never die from a single bad tick.
export function createPollLoop(
  scope: string,
  opts: {
    run: (scope: string) => Promise<SyncResult>;
    lock: ScopeLock;
    notifiers: OpsNotifier[];
    intervalMs: number;
    timers?: TimerSource;
    onLog?: (line: string) => void;
  },
): PollLoop {
  let stopped = false;
  let started = false;
  let handle: unknown = null;
  const timers = opts.timers ?? defaultTimerSource;
  const log = opts.onLog ?? ((line: string) => console.log(line));

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const outcome = await pollOnce(scope, {
        run: opts.run,
        lock: opts.lock,
        notifier: {
          syncFailed: (info) => notifyFailureToAll(opts.notifiers, info),
        },
      });
      log(`[poll] scope=${scope} ${outcome.outcome}`);
    } catch (err) {
      log(
        `[poll] scope=${scope} crashed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (!stopped) handle = timers.setTimeout(tick, opts.intervalMs);
  };

  return {
    start() {
      if (started) return;
      started = true;
      handle = timers.setTimeout(tick, 0);
    },
    stop(): Promise<void> {
      stopped = true;
      if (handle !== null) {
        timers.clearTimeout(handle);
        handle = null;
      }
      return Promise.resolve();
    },
  };
}
