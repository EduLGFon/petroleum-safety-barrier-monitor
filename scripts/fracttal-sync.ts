// Fracttal sync script - replay a fixture or one live page into Postgres (P3).
// This is why it exists: the sync pipeline (parse -> map -> reconcile -> apply)
// is wired to SQL in lib/server/sql/sync.ts, and this CLI drives it safely:
//   - default DRY RUN: no row is ever written unless --apply is given;
//   - fixture mode replays scripts/fixtures/ (dev/CI) until a reviewed prod
//     capture replaces it (visible meta.synthetic flag); --work-fixture adds
//     the work-order status pass (defaults to scripts/fixtures/
//     fracttal-work-sample.json when present, asset signals only otherwise);
//   - live mode reuses the read-only client: the full equipment sweep,
//     paginated to the envelope total (--pages, max 400), plus the newest
//     --work-pages of work orders/requests for statuses (pages fetch
//     concurrently, throughput capped by --rate-per-min); a truncated sweep
//     aborts before runSync (zero writes) - a too-small --pages fails
//     loudly, raise and rerun;
//   - never sends emails - audit rows go to sync_state, nothing else mails.
// The exit code is 1 on thrown errors; mapping/unmapped skips are warnings.
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

import { buildWorkEvents, resolverFor } from "../lib/server/fracttal/work.ts";

import { runSync, type SyncResult } from "../lib/server/fracttal/sync.ts";

import type { WorkEventsResolver } from "../lib/server/fracttal/work.ts";

import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import type { OpsNotifier } from "../lib/server/fracttal/notify.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";
const DEFAULT_FIXTURE = "scripts/fixtures/fracttal-assets-sample.json";
const DEFAULT_WORK_FIXTURE = "scripts/fixtures/fracttal-work-sample.json";

interface SyncFlags {
  fixturePath: string;
  workFixturePath?: string;
  live: boolean;
  scope?: string;
  itemType: ItemTypeValue;
  pages: number;
  workPages: number;
  workOpenOnly: boolean;
  ratePerMin: number;
  fetchConcurrency: number;
  baseUrl: string;
  apply: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): SyncFlags {
  const base: SyncFlags = {
    fixturePath: DEFAULT_FIXTURE,
    live: false,
    itemType: 2,
    pages: 200,
    workPages: 5,
    workOpenOnly: true,
    ratePerMin: 150,
    fetchConcurrency: 4,
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
    apply: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture") base.fixturePath = argv[++i];
    else if (arg === "--work-fixture") base.workFixturePath = argv[++i];
    else if (arg === "--live") base.live = true;
    else if (arg === "--scope") base.scope = argv[++i];
    else if (arg === "--item-type") {
      base.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (arg === "--pages") {
      base.pages = Math.min(400, Math.max(1, Number(argv[++i]) || 200));
    } else if (arg === "--work-pages") {
      base.workPages = Math.min(40, Math.max(1, Number(argv[++i]) || 5));
    } else if (arg === "--work-open-only") base.workOpenOnly = true;
    else if (arg === "--work-windowed") base.workOpenOnly = false;
    else if (arg === "--rate-per-min") {
      base.ratePerMin = Math.max(1, Number(argv[++i]) || 150);
    } else if (arg === "--fetch-concurrency") {
      base.fetchConcurrency = Math.max(1, Number(argv[++i]) || 4);
    } else if (arg === "--base-url") base.baseUrl = argv[++i];
    else if (arg === "--apply") base.apply = true;
    else if (arg === "--json") base.json = true;
  }
  return base;
}

// sourceFor: the row generator handed to runSync - fixture rows come straight
// from the JSON file, live rows from one bounded GET (one location only).
// Both modes also supply prebuilt work events: the fetch happens BEFORE
// runSync so a work-endpoint failure aborts with zero writes (fail-closed)
// instead of decaying statuses to Disponivel.
async function sourceFor(
  flags: SyncFlags,
): Promise<{
  source: () => Promise<unknown[]>;
  scope: string;
  workEvents: WorkEventsResolver | null;
  workNote: string;
}> {
  if (!flags.live) {
    const text = await Deno.readTextFile(flags.fixturePath);
    const json = JSON.parse(text) as { items?: unknown[]; meta?: unknown };
    const items = Array.isArray(json.items) ? json.items : [];
    if (items.length === 0) {
      console.warn(`[fracttal-sync] fixture ${flags.fixturePath} has no items`);
    }
    const workPath = flags.workFixturePath ?? DEFAULT_WORK_FIXTURE;
    let workEvents: WorkEventsResolver | null = null;
    let workNote = "no work fixture";
    try {
      const workText = await Deno.readTextFile(workPath);
      const workJson = JSON.parse(workText) as {
        orders?: unknown[];
        requests?: unknown[];
      };
      const built = buildWorkEvents(
        Array.isArray(workJson.orders) ? workJson.orders : [],
        Array.isArray(workJson.requests) ? workJson.requests : [],
      );
      workEvents = resolverFor(built.events);
      workNote =
        `${workPath}: ${built.events.size} coded signals, ${built.malformed.length} malformed`;
    } catch {
      console.warn(
        `[fracttal-sync] no work fixture at ${workPath} (asset signals only)`,
      );
    }
    return {
      source: () => Promise.resolve(items),
      scope: flags.scope ?? `fixture:${flags.fixturePath}`,
      workEvents,
      workNote,
    };
  }

  const { key, secret, baseUrl, itemType } = loadSyncConfig(
    undefined,
    { baseUrl: flags.baseUrl, itemType: flags.itemType },
  );
  const client = createFracttalClient({
    baseUrl,
    credentials: { key, secret },
    ratePerMin: flags.ratePerMin,
  });
  const openStatuses = flags.workOpenOnly
    ? [...OPEN_WORK_ORDER_STATUSES]
    : undefined;
  // Work fetches eagerly so a work-endpoint failure aborts before any
  // runSync (zero writes, fail-closed); items stay lazy in the source
  // closure so the running audit row covers fetch+apply.
  const work = await fetchWorkSignals(client, {
    maxPages: flags.workPages,
    openStatuses,
    openMaxPages: flags.pages,
    concurrency: flags.fetchConcurrency,
  });
  if (work.ordersTruncated) {
    console.warn(
      `[fracttal-sync] open work sweep truncated (orders=${work.workOrders})`,
    );
  }
  console.log(
    `[fracttal-sync] live work: ${work.workOrders} orders, ` +
      `${work.workRequests} requests, malformed ${work.workMalformed}`,
  );
  return {
    source: async () => {
      // A truncated sweep aborts inside runSync with zero writes - raise
      // --pages (max 400) and rerun.
      const items = await fetchItemSignals(client, {
        itemType: itemType as ItemTypeValue,
        maxPages: flags.pages,
        concurrency: flags.fetchConcurrency,
      });
      console.log(
        `[fracttal-sync] live fetch: ${items.itemRows.length} rows (of ${items.itemTotal}, ` +
          `${items.pagesFetched} pages)`,
      );
      return items.itemRows;
    },
    scope: flags.scope ?? "fracttal-live:all",
    workEvents: work.workEvents,
    workNote: `live: ${
      work.workOrders + work.workRequests
    } work rows, ${work.workMalformed} malformed`,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  const { source, scope, workEvents, workNote } = await sourceFor(flags);
  console.log(`[fracttal-sync] work signals: ${workNote}`);

  const notifiers: OpsNotifier[] = [consoleNotifier];
  const smtp = smtpConfigFromEnv();
  if (smtp) notifiers.push(smtpEmailNotifier(smtp));
  const startedAt = new Date();

  let result: SyncResult;
  try {
    result = await runSync(source, {
      scope,
      dryRun: !flags.apply,
      workEvents,
    });
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    await notifyFailureToAll(notifiers, {
      scope,
      startedAt: startedAt.toISOString(),
      note,
      runId: null,
    });
    console.error(`[fracttal-sync] ${note}`);
    Deno.exit(1);
  }

  const { plan } = result;
  const counts = result.written ?? plan.counts;
  // availabilityTally: what the plan WOULD set per availability status
  // (inserts + updates + restores carry inputs; skips and deletes do not).
  // Dry-run diffs between work-pass modes compare this line.
  const availabilityTally: Record<number, number> = {};
  for (const entry of plan.entries) {
    if (entry.kind === "skip" || entry.kind === "delete") continue;
    const id = entry.input.availabilityId;
    availabilityTally[id] = (availabilityTally[id] ?? 0) + 1;
  }
  const summary = {
    scope: result.scope,
    status: result.status,
    dryRun: !flags.apply,
    fetchedAt: result.fetchedAt,
    parsed: result.parsed,
    malformed: result.malformed.length,
    mappingSkips: result.mappingSkips.length,
    mappingWarnings: result.mappingWarnings.length,
    work: workNote,
    plan: plan.counts,
    availability: availabilityTally,
    written: result.written,
    runId: result.runId,
  };
  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `[fracttal-sync] ${scope} (${flags.apply ? "applied" : "dry-run"}): ` +
        `parsed=${result.parsed} malformed=${result.malformed.length} ` +
        `skips=${result.mappingSkips.length} ` +
        `warnings=${result.mappingWarnings.length} ` +
        `plan { i:${plan.counts.inserts} u:${plan.counts.updates} ` +
        `d:${plan.counts.deletes} s:${plan.counts.skips} } ` +
        `availability ${JSON.stringify(availabilityTally)} ` +
        (result.written
          ? `written { i:${counts.inserts} u:${counts.updates} ` +
            `d:${counts.deletes} s:${counts.skips} }`
          : ""),
    );
    for (const skip of result.mappingSkips) {
      console.warn(`[fracttal-sync] skipped ${skip.code}: ${skip.reason}`);
    }
    for (const w of result.mappingWarnings) {
      console.warn(`[fracttal-sync] warning ${w.code}: ${w.warning}`);
    }
    for (const m of result.malformed) {
      console.warn(`[fracttal-sync] row ${m.index} malformed: ${m.reason}`);
    }
    if (result.runId !== null) {
      console.log(`[fracttal-sync] audit row sync_state.id=${result.runId}`);
    }
  }
}

if (import.meta.main) {
  await main();
}
