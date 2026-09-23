// Multi-scope poll cycle for all-station operation.
// This is why it exists: one loop per scope fires every scope at once (a
// thundering herd of 35 scopes x N pages against the 200 req/min ceiling)
// and refetches the same tenant-global work page once per scope. The cycle
// fetches the shared signals once, runs scopes sequentially, and chains the
// next cycle after completion, so the request rate is bounded by construction
// and a slow cycle can never overlap itself. Single-scope operation keeps
// using createPollLoop in ./runner.ts.
import type {
  PollLoop,
  PollOutcome,
  ScopeLock,
  TimerSource,
} from "./runner.ts";

import { notifyFailureToAll } from "./notify.ts";

import type { OpsNotifier } from "./notify.ts";

import type { SyncResult } from "./sync.ts";

import { pollOnce } from "./runner.ts";

export interface CycleScope<Shared> {
  scope: string;
  run: (scope: string, shared: Shared) => Promise<SyncResult>;
}

// CycleFailure: a cycle-level failure that never reached a run row
// (shared fetch threw before any scope started).
export interface CycleFailure {
  scope: string;
  startedAt: string;
  note: string;
}

export interface CycleOptions<Shared> {
  scopes: Array<CycleScope<Shared>>;
  // fetchShared runs once per cycle (tenant-global signals such as the work
  // pass). A throw aborts the cycle fail-closed with zero writes anywhere.
  fetchShared: () => Promise<Shared>;
  lock: ScopeLock;
  notifiers: OpsNotifier[];
  intervalMs: number;
  // cycleScope labels cycle-level failure notes (default "cycle").
  cycleScope?: string;
  // onCycleFailure persists cycle-level failures (shared fetch) that never
  // reach a run row, so ops sees them in sync_state instead of an aging
  // idle. Best-effort: recording failures never break the cadence.
  onCycleFailure?: (info: CycleFailure) => Promise<void>;
  timers?: TimerSource;
  onLog?: (line: string) => void;
  now?: () => Date;
}

// defaultTimerSource mirrors runner.ts so this module stays dependency-light.
const defaultTimerSource: TimerSource = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as number),
};

// createCycleLoop: sequential multi-scope cadence with start/stop semantics.
// One scope's failure (or a lock crash) is logged and the cycle continues;
// stop() waits for the in-flight cycle instead of abandoning it mid-scope.
export function createCycleLoop<Shared>(
  opts: CycleOptions<Shared>,
): PollLoop {
  let stopped = false;
  let started = false;
  let running = false;
  let handle: unknown = null;
  let current: Promise<void> | null = null;
  const timers = opts.timers ?? defaultTimerSource;
  const log = opts.onLog ?? ((line: string) => console.log(line));
  const now = opts.now ?? (() => new Date());
  const cycleScope = opts.cycleScope ?? "cycle";

  const schedule = (): void => {
    if (!stopped) handle = timers.setTimeout(tick, opts.intervalMs);
  };

  const tick = (): void => {
    if (stopped) return;
    if (running) {
      log(`[cycle] previous cycle still running, skipped`);
      schedule();
      return;
    }
    running = true;
    current = (async () => {
      try {
        let shared: Shared;
        try {
          shared = await opts.fetchShared();
        } catch (err) {
          const note = err instanceof Error ? err.message : String(err);
          const info: CycleFailure = {
            scope: cycleScope,
            startedAt: now().toISOString(),
            note,
          };
          await notifyFailureToAll(opts.notifiers, { ...info, runId: null });
          if (opts.onCycleFailure !== undefined) {
            try {
              await opts.onCycleFailure(info);
            } catch (recordErr) {
              log(
                `[cycle] failure record failed: ${
                  recordErr instanceof Error
                    ? recordErr.message
                    : String(recordErr)
                }`,
              );
            }
          }
          log(`[cycle] shared fetch failed: ${note}`);
          return;
        }
        let ok = 0;
        let skipped = 0;
        let failed = 0;
        const t0 = Date.now();
        for (const s of opts.scopes) {
          if (stopped) break;
          const s0 = Date.now();
          const outcome: PollOutcome =
            await (async (): Promise<PollOutcome> => {
              try {
                return await pollOnce(s.scope, {
                  run: (scope) => s.run(scope, shared),
                  lock: opts.lock,
                  notifier: {
                    syncFailed: (info) =>
                      notifyFailureToAll(opts.notifiers, info),
                  },
                });
              } catch (err) {
                const note = err instanceof Error ? err.message : String(err);
                return { scope: s.scope, outcome: "failed", note };
              }
            })();
          if (outcome.outcome === "ok") ok++;
          else if (outcome.outcome === "skipped") skipped++;
          else failed++;
          log(
            `[cycle] scope=${s.scope} ${outcome.outcome} ${Date.now() - s0}ms`,
          );
        }
        log(
          `[cycle] done ok=${ok} skipped=${skipped} failed=${failed} ` +
            `${Date.now() - t0}ms`,
        );
      } catch (err) {
        // Last-resort guard: every step above already guards itself, so this
        // only fires on logger bugs. Report loudly and never reject: stop()
        // awaits this promise and must stay throw-free like createPollLoop.
        console.error(
          `[cycle] crashed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        running = false;
        current = null;
      }
    })();
    void current.then(schedule, schedule);
  };

  return {
    start() {
      if (started) return;
      started = true;
      handle = timers.setTimeout(tick, 0);
    },
    async stop(): Promise<void> {
      stopped = true;
      if (handle !== null) {
        timers.clearTimeout(handle);
        handle = null;
      }
      await current;
    },
  };
}
