// Fracttal force-sync - full live sweep that always writes the truth.
// This is why it exists: fracttal-sync.ts defaults to fixture replay and
// dry-run (safe for dev), and the poller loops forever (good for freshness,
// bad for one-shot recovery). After an outage, a bad deploy, or a stale
// lock, ops needs one command that sweeps the whole tenant live and applies
// it now: preflight (creds + overlap guard), eager work pass (fail-closed),
// full item sweep, runSync apply, audit summary. Dry-run unless --apply.
//   deno run -A --env-file=.env scripts/fracttal-force-sync.ts --apply [--force]
// Flags: --pages N (default 400, max 400), --work-pages N (default 5, max
// 40), --rate-per-min N, --fetch-concurrency N, --scope NAME, --force
// (proceed while the poller scope is fresh-running), --json, --apply.
import {
  consoleNotifier,
  notifyFailureToAll,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import {
  fetchItemSignals,
  fetchWorkSignals,
} from "../lib/server/fracttal/live-scope.ts";

import { OPEN_WORK_ORDER_STATUSES } from "../lib/server/fracttal/barrier-rules.ts";

import {
  isScopeBusy,
  runSync,
  type SyncResult,
} from "../lib/server/fracttal/sync.ts";

import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import type { OpsNotifier } from "../lib/server/fracttal/notify.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

import { getSyncStatus, syncScopeRunning } from "../lib/server/sql/sync.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";
const SWEEP_SCOPE = "fracttal-live:all";

interface ForceFlags {
  pages: number;
  workPages: number;
  ratePerMin: number;
  concurrency: number;
  itemType: ItemTypeValue;
  baseUrl: string;
  scope: string;
  force: boolean;
  apply: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): ForceFlags {
  const f: ForceFlags = {
    pages: 400,
    workPages: 5,
    ratePerMin: 150,
    concurrency: 4,
    itemType: 2,
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
    scope: SWEEP_SCOPE,
    force: false,
    apply: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pages") {
      f.pages = Math.min(400, Math.max(1, Number(argv[++i]) || 400));
    } else if (a === "--work-pages") {
      f.workPages = Math.min(40, Math.max(1, Number(argv[++i]) || 5));
    } else if (a === "--rate-per-min") {
      f.ratePerMin = Math.max(1, Number(argv[++i]) || 150);
    } else if (a === "--fetch-concurrency") {
      f.concurrency = Math.max(1, Number(argv[++i]) || 4);
    } else if (a === "--item-type") {
      f.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (a === "--base-url") f.baseUrl = argv[++i];
    else if (a === "--scope") f.scope = argv[++i];
    else if (a === "--force") f.force = true;
    else if (a === "--apply") f.apply = true;
    else if (a === "--json") f.json = true;
  }
  return f;
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  let cfg: { key: string; secret: string };
  try {
    cfg = loadSyncConfig(undefined, {
      baseUrl: flags.baseUrl,
      itemType: flags.itemType,
    });
  } catch (err) {
    console.error(
      `[force-sync] ${err instanceof Error ? err.message : String(err)}`,
    );
    Deno.exit(2);
  }
  // Overlap guard: the poller owns this scope while fresh-running. Refuse
  // unless --force (two writers interleave audit rows and confuse triage).
  // startRun still reaps stale orphans itself, so --force only overrides a
  // live lock, never a dead one.
  try {
    const running = await syncScopeRunning(flags.scope);
    if (running && !flags.force) {
      console.error(
        `[force-sync] scope ${flags.scope} is fresh-running (poller active). Stop the poller or re-run with --force.`,
      );
      Deno.exit(3);
    }
    if (running) {
      console.warn(
        `[force-sync] --force: proceeding over a live lock scope=${flags.scope}`,
      );
    }
  } catch (err) {
    console.warn(
      `[force-sync] lock check skipped (DB unreachable?): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  try {
    const s = await getSyncStatus();
    const last = s.lastRun
      ? `${s.lastRun.status} ${s.lastRun.finishedAt}`
      : "none";
    console.log(`[force-sync] last finished run: ${last} (state=${s.state})`);
  } catch { /* boot visibility only */ }

  const client = createFracttalClient({
    baseUrl: flags.baseUrl,
    credentials: { key: cfg!.key, secret: cfg!.secret },
    ratePerMin: flags.ratePerMin,
  });
  const notifiers: OpsNotifier[] = [consoleNotifier];
  const smtp = smtpConfigFromEnv();
  if (smtp) notifiers.push(smtpEmailNotifier(smtp));
  const startedAt = new Date();

  // Eager work pass: a work-endpoint failure aborts with zero writes
  // (fail-closed) instead of decaying statuses to Disponivel.
  const work = await fetchWorkSignals(client, {
    maxPages: flags.workPages,
    openStatuses: [...OPEN_WORK_ORDER_STATUSES],
    openMaxPages: flags.pages,
    concurrency: flags.concurrency,
  }).catch(async (err) => {
    const note = err instanceof Error ? err.message : String(err);
    await notifyFailureToAll(notifiers, {
      scope: flags.scope,
      startedAt: startedAt.toISOString(),
      note,
      runId: null,
    });
    console.error(`[force-sync] work pass failed: ${note}`);
    Deno.exit(1);
    throw err;
  });
  if (work.ordersTruncated) {
    console.warn(
      `[force-sync] OPEN WORK SWEEP TRUNCATED (orders=${work.workOrders}) - widen the work cap, statuses may decay`,
    );
  }
  console.log(
    `[force-sync] work: ${work.workOrders} orders, ${work.workRequests} requests, malformed ${work.workMalformed}`,
  );

  let result: SyncResult;
  try {
    result = await runSync(async () => {
      const items = await fetchItemSignals(client, {
        itemType: flags.itemType,
        maxPages: flags.pages,
        concurrency: flags.concurrency,
      });
      // A truncated sweep aborts inside runSync with zero writes - raise
      // --pages (max 400) and rerun, never bypass.
      console.log(
        `[force-sync] sweep: ${items.itemRows.length} rows (of ${items.itemTotal}, ${items.pagesFetched} pages)`,
      );
      return items.itemRows;
    }, {
      scope: flags.scope,
      dryRun: !flags.apply,
      workEvents: work.workEvents,
    });
  } catch (err) {
    // Atomic startRun lost the race after preflight (the poller opened a
    // fresh run in between): same clean refusal as the guard above, no ops
    // mail - contention is routine, not an error.
    if (isScopeBusy(err)) {
      console.error(
        `[force-sync] scope ${flags.scope} is fresh-running (poller active). Stop the poller or re-run with --force.`,
      );
      Deno.exit(3);
    }
    const note = err instanceof Error ? err.message : String(err);
    await notifyFailureToAll(notifiers, {
      scope: flags.scope,
      startedAt: startedAt.toISOString(),
      note,
      runId: null,
    });
    console.error(`[force-sync] ${note}`);
    Deno.exit(1);
  }
  const { plan } = result!;
  const summary = {
    scope: result!.scope,
    status: result!.status,
    dryRun: !flags.apply,
    forced: flags.force,
    fetchedAt: result!.fetchedAt,
    parsed: result!.parsed,
    malformed: result!.malformed.length,
    mappingSkips: result!.mappingSkips.length,
    plan: plan.counts,
    written: result!.written,
    runId: result!.runId,
  };
  if (flags.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(
      `[force-sync] ${flags.scope} (${
        flags.apply ? "applied" : "dry-run"
      }): parsed=${result!.parsed} ` +
        `plan { i:${plan.counts.inserts} u:${plan.counts.updates} d:${plan.counts.deletes} s:${plan.counts.skips} }` +
        (result!.written
          ? ` written { i:${result!.written.inserts} u:${
            result!.written.updates
          } d:${result!.written.deletes} s:${result!.written.skips} }`
          : "") +
        (result!.runId !== null
          ? ` audit row sync_state.id=${result!.runId}`
          : ""),
    );
  }
}

if (import.meta.main) await main();
