// Fracttal sync script - replay a fixture or one live page into Postgres (P3).
// This is why it exists: the sync pipeline (parse -> map -> reconcile -> apply)
// is wired to SQL in lib/server/sql/sync.ts, and this CLI drives it safely:
//   - default DRY RUN: no row is ever written unless --apply is given;
//   - fixture mode replays scripts/fixtures/ (dev/CI) until a reviewed prod
//     capture replaces it (visible meta.synthetic flag); --work-fixture adds
//     the work-order status pass (defaults to scripts/fixtures/
//     fracttal-work-sample.json when present, asset signals only otherwise);
//   - live mode reuses the read-only client: one location, paginated to the
//     envelope total (--pages, max 40), plus one bounded page each of work
//     orders/requests for statuses; a truncated scope aborts before runSync
//     (zero writes) - a too-small --pages fails loudly, raise and rerun;
//   - never sends emails - audit rows go to sync_state, nothing else mails.
// The exit code is 1 on thrown errors; mapping/unmapped skips are warnings.
import {
  consoleNotifier,
  notifyFailureToAll,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import { buildWorkEvents, resolverFor } from "../lib/server/fracttal/work.ts";

import { runSync, type SyncResult } from "../lib/server/fracttal/sync.ts";

import { fetchScopeSignals } from "../lib/server/fracttal/live-scope.ts";

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
  locationCode?: string;
  itemType: ItemTypeValue;
  pages: number;
  baseUrl: string;
  apply: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): SyncFlags {
  const base: SyncFlags = {
    fixturePath: DEFAULT_FIXTURE,
    live: false,
    itemType: 2,
    pages: 1,
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
    else if (arg === "--location-code") base.locationCode = argv[++i];
    else if (arg === "--item-type") {
      base.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (arg === "--pages") {
      base.pages = Math.min(40, Math.max(1, Number(argv[++i]) || 1));
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
  if (!flags.locationCode) {
    throw new Error("--location-code <station> required in --live mode");
  }
  const client = createFracttalClient({
    baseUrl,
    credentials: { key, secret },
  });
  const dateGte = Deno.env.get("FRACTTAL_WORK_DATE_GTE") ?? undefined;
  // One shared assembly: complete item pages (guarded, fail-closed) plus
  // the bounded work-order status pass. A truncated scope aborts here with
  // zero writes - raise --pages (max 40) and rerun.
  const fetched = await fetchScopeSignals(client, {
    locationCode: flags.locationCode,
    itemType: itemType as ItemTypeValue,
    maxPages: flags.pages,
    dateGte,
  });
  console.log(
    `[fracttal-sync] live fetch: ${fetched.itemRows.length} rows (of ${fetched.itemTotal}, ` +
      `${fetched.pagesFetched} pages) at location_code=${flags.locationCode}; ` +
      `work orders ${fetched.workOrders}, requests ${fetched.workRequests}, ` +
      `work malformed ${fetched.workMalformed}`,
  );
  return {
    source: () => Promise.resolve(fetched.itemRows),
    scope: flags.scope ?? `fracttal-live:${flags.locationCode}`,
    workEvents: fetched.workEvents,
    workNote: `live: ${
      fetched.workOrders + fetched.workRequests
    } work rows, ${fetched.workMalformed} malformed`,
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
