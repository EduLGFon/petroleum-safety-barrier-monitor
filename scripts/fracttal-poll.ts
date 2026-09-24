// Fracttal poll script - full-sweep polling cycle ("polling first").
// This is why it exists: true push does not exist upstream (Fracttal One
// exposes a REST API only; no webhook mechanism was found in the official
// docs as of 2026-09), so near-real-time means polling. Each cycle sweeps
// the whole equipment set unfiltered - server-side station scoping is
// unavailable (location_code values are group/asset tags, never station
// codes; verified live 2026-09-20) - while stations partition client-side
// in mapAsset. The tenant-global work pass is fetched once per cycle and
// shared; the next cycle chains after completion, so the request rate is
// bounded by construction. Failures land in sync_state + notify ops
// (console, plus OPS_SMTP_* email when configured).
//
//   FRACTTAL_KEY / FRACTTAL_SECRET      required (prod tenant, reviewed)
//   FRACTTAL_BASE_URL                    optional (default app.fracttal.com/api)
//   FRACTTAL_POLL_SECONDS                pause between cycles (default 300;
//                                       effective period is cycle + pause)
//   FRACTTAL_SYNC_ITEM_TYPE              default 2 (Equipment)
//   FRACTTAL_SYNC_MAX_PAGES              item pages per cycle (default 200 x
//                                        100 rows; the tenant holds ~18k
//                                        equipment today. A scope needing more
//                                        aborts loudly - raise it)
//   FRACTTAL_SYNC_WORK_MAX_PAGES         newest work pages per endpoint per
//                                        cycle (default 5 x 100, shared)
//   FRACTTAL_RATE_PER_MIN                sustained request rate, token bucket
//                                        shared by every request including
//                                        parallel page fetches (default 150,
//                                        75% of the 200 req/min/IP ceiling)
//   FRACTTAL_FETCH_CONCURRENCY           parallel page fetches
//                                        (default 4, reassembled in order)
//   FRACTTAL_WORK_OPEN_ONLY              0/false: newest window instead of
//                                        the open-status sweep (default on -
//                                        verified live, see docs/FRACTTAL.md)
//   OPS_SMTP_HOST / OPS_SMTP_PORT / OPS_SMTP_USER / OPS_SMTP_PASS
//   OPS_EMAIL_TO / OPS_EMAIL_FROM        emails are optional; without them
//                                         failures still log via [ops] console
//                                         and persist as failed sync_state rows
import {
  fetchItemSignals,
  fetchWorkSignals,
  type WorkFetch,
} from "../lib/server/fracttal/live-scope.ts";

import {
  consoleNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import {
  getSyncStatus,
  recordSyncFailure,
  syncScopeRunning,
} from "../lib/server/sql/sync.ts";

import { OPEN_WORK_ORDER_STATUSES } from "../lib/server/fracttal/barrier-rules.ts";

import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import type { OpsNotifier } from "../lib/server/fracttal/notify.ts";

import { createCycleLoop } from "../lib/server/fracttal/cycle.ts";

import { runSync } from "../lib/server/fracttal/sync.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";

// SWEEP_SCOPE is the one audit scope: every cycle reconciles the whole
// tenant, so per-station scope labels no longer exist.
const SWEEP_SCOPE = "fracttal-live:all";

interface PollFlags {
  seconds: number;
  itemType: ItemTypeValue;
  maxPages: number;
  workMaxPages: number;
  ratePerMin: number;
  concurrency: number;
  baseUrl: string;
}

function parseFlags(): PollFlags {
  return {
    seconds: Math.max(5, Number(Deno.env.get("FRACTTAL_POLL_SECONDS")) || 300),
    itemType: (Number(Deno.env.get("FRACTTAL_SYNC_ITEM_TYPE")) ||
      2) as ItemTypeValue,
    maxPages: Math.max(
      1,
      Math.floor(Number(Deno.env.get("FRACTTAL_SYNC_MAX_PAGES")) || 200),
    ),
    workMaxPages: Math.max(
      1,
      Math.floor(Number(Deno.env.get("FRACTTAL_SYNC_WORK_MAX_PAGES")) || 5),
    ),
    ratePerMin: Math.max(
      1,
      Math.floor(Number(Deno.env.get("FRACTTAL_RATE_PER_MIN")) || 150),
    ),
    concurrency: Math.max(
      1,
      Math.floor(Number(Deno.env.get("FRACTTAL_FETCH_CONCURRENCY")) || 4),
    ),
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
  };
}

// logLastRunAge: boot visibility for ops - a poller starting after hours
// of downtime says so upfront instead of leaving the dashboard to imply
// it. Read-only; a DB outage here warns and still boots the loop.
async function logLastRunAge(): Promise<void> {
  try {
    const status = await getSyncStatus();
    const iso = status.runningSince ?? status.lastRun?.finishedAt ?? null;
    if (iso === null) {
      console.log("[fracttal-poll] no finished sync run on record");
      return;
    }
    const mins = Math.max(
      0,
      Math.floor((Date.now() - new Date(iso).getTime()) / 60_000),
    );
    const age = mins < 1
      ? "just now"
      : mins < 60
      ? `${mins} min ago`
      : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
    console.log(`[fracttal-poll] last finished run ${age} (${status.state})`);
  } catch (err) {
    console.warn(
      `[fracttal-poll] last-run check failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function main(): void {
  const flags = parseFlags();
  let syncCfg: { key: string; secret: string };
  try {
    syncCfg = loadSyncConfig(undefined, {
      baseUrl: flags.baseUrl,
      itemType: flags.itemType,
    });
  } catch (err) {
    console.error(
      `[fracttal-poll] ${err instanceof Error ? err.message : String(err)}`,
    );
    Deno.exit(2);
  }
  const { key, secret } = syncCfg;

  const client = createFracttalClient({
    baseUrl: flags.baseUrl,
    credentials: { key, secret },
    ratePerMin: flags.ratePerMin,
  });

  const notifiers: OpsNotifier[] = [consoleNotifier];
  const smtp = smtpConfigFromEnv();
  if (smtp) notifiers.push(smtpEmailNotifier(smtp));

  // Cycle: full equipment sweep plus one shared work pass (tenant-global).
  // Open-only mode (default on) sweeps each open ot_status to completion
  // within the item page cap, so every open corrective WO is visible every
  // cycle; set FRACTTAL_WORK_OPEN_ONLY=0 for the newest window instead. A
  // work-endpoint failure throws before runSync, so the cycle notifies ops
  // once with zero writes instead of decaying statuses.
  const openOnly = !["0", "false"].includes(
    (Deno.env.get("FRACTTAL_WORK_OPEN_ONLY") ?? "").toLowerCase(),
  );
  const openStatuses = openOnly ? [...OPEN_WORK_ORDER_STATUSES] : undefined;
  const loop = createCycleLoop<WorkFetch>({
    scopes: [{
      scope: SWEEP_SCOPE,
      // The item fetch stays lazy inside runSync's source closure so the
      // running audit row (and the overlap lock) covers fetch+apply, not
      // just the DB phase. Work stays eager: a work-endpoint failure throws
      // before any runSync, so the cycle notifies ops once with zero writes
      // instead of decaying statuses.
      run: async (scope, shared) => {
        return await runSync(async () => {
          const items = await fetchItemSignals(client, {
            itemType: flags.itemType,
            maxPages: flags.maxPages,
            concurrency: flags.concurrency,
          });
          if (items.itemRows.length === 0) {
            console.warn(`[fracttal-poll] sweep: 0 items (check API health)`);
          } else {
            console.log(
              `[fracttal-poll] sweep: ${items.itemRows.length} items ` +
                `(${items.pagesFetched} pages)`,
            );
          }
          return items.itemRows;
        }, {
          scope,
          dryRun: false,
          workEvents: shared.workEvents,
        });
      },
    }],
    fetchShared: async () => {
      const work = await fetchWorkSignals(client, {
        maxPages: flags.workMaxPages,
        openStatuses,
        openMaxPages: flags.maxPages,
        concurrency: flags.concurrency,
      });
      const mode = openOnly ? "open sweep" : "newest window";
      if (work.ordersTruncated) {
        console.warn(
          `[fracttal-poll] OPEN WORK SWEEP TRUNCATED (${mode}, orders=${work.workOrders}) - ` +
            `old open work is invisible and statuses may decay; widen the work cap`,
        );
      }
      console.log(
        `[fracttal-poll] work (${mode}): ${work.workOrders} orders, ` +
          `${work.workRequests} requests${
            work.requestsTruncated ? " (windowed)" : ""
          }, ` +
          `malformed ${work.workMalformed}`,
      );
      return work;
    },
    lock: {
      isRunning: (scope) => syncScopeRunning(scope),
    },
    notifiers,
    intervalMs: flags.seconds * 1000,
    cycleScope: "fracttal-cycle",
    // Pre-run failures (shared work fetch) persist as failed rows so the
    // dashboard shows them instead of an ever-aging success.
    onCycleFailure: (info) => recordSyncFailure(info.scope, info.note),
  });

  const stop = async (): Promise<void> => {
    console.log("[fracttal-poll] stopping (waits for the in-flight sweep)");
    await loop.stop();
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", () => void stop());
  Deno.addSignalListener("SIGTERM", () => void stop());

  loop.start();
  void logLastRunAge();
  // Boot target line: one line proving which tenant host, work mode, and
  // notify channels this process runs with. Host only (no path, no
  // secret); a malformed URL is used as-is and fails loudly on first fetch.
  let target = flags.baseUrl;
  try {
    target = new URL(flags.baseUrl).hostname;
  } catch {
    // Keep the raw value; the first fetch reports the real problem.
  }
  console.log(
    `[fracttal-poll] target=${target} work=${
      openOnly ? "open sweep" : "newest window"
    } notifiers=console${smtp ? ",email" : ""}`,
  );
  console.log(
    `[fracttal-poll] sweeping every ${flags.seconds}s ` +
      `(item_type=${flags.itemType}, max_pages=${flags.maxPages}, ` +
      `work_pages=${flags.workMaxPages}, rate=${flags.ratePerMin}/min, ` +
      `concurrency=${flags.concurrency})`,
  );
}

if (import.meta.main) {
  main();
}
