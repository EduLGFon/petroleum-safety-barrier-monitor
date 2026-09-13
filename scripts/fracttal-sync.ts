// Fracttal sync script - replay a fixture or one live page into Postgres (P3).
// This is why it exists: the sync pipeline (parse -> map -> reconcile -> apply)
// is wired to SQL in lib/server/sql/sync.ts, and this CLI drives it safely:
//   - default DRY RUN: no row is ever written unless --apply is given;
//   - fixture mode replays scripts/fixtures/ (dev/CI) until a reviewed prod
//     capture replaces it (visible meta.synthetic flag);
//   - live mode reuses the read-only client: one location, 1 page, capped;
//   - never sends emails - audit rows go to sync_state, nothing else mails.
// The exit code is 1 on thrown errors; mapping/unmapped skips are warnings.
import { createFracttalClient } from "../lib/server/fracttal/client.ts";
import { runSync, type SyncResult } from "../lib/server/fracttal/sync.ts";
import {
  consoleNotifier,
  notifyFailureToAll,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";
import type { OpsNotifier } from "../lib/server/fracttal/notify.ts";
import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";
const DEFAULT_FIXTURE = "scripts/fixtures/fracttal-assets-sample.json";

interface SyncFlags {
  fixturePath: string;
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
    else if (arg === "--live") base.live = true;
    else if (arg === "--scope") base.scope = argv[++i];
    else if (arg === "--location-code") base.locationCode = argv[++i];
    else if (arg === "--item-type") {
      base.itemType = Number(argv[++i]) as ItemTypeValue;
    } else if (arg === "--pages") {
      base.pages = Math.min(10, Math.max(1, Number(argv[++i]) || 1));
    } else if (arg === "--base-url") base.baseUrl = argv[++i];
    else if (arg === "--apply") base.apply = true;
    else if (arg === "--json") base.json = true;
  }
  return base;
}

// sourceFor: the row generator handed to runSync - fixture rows come straight
// from the JSON file, live rows from one bounded GET (one location only).
async function sourceFor(
  flags: SyncFlags,
): Promise<{ source: () => Promise<unknown[]>; scope: string }> {
  if (!flags.live) {
    const text = await Deno.readTextFile(flags.fixturePath);
    const json = JSON.parse(text) as { items?: unknown[]; meta?: unknown };
    const items = Array.isArray(json.items) ? json.items : [];
    if (items.length === 0) {
      console.warn(`[fracttal-sync] fixture ${flags.fixturePath} has no items`);
    }
    return {
      source: () => Promise.resolve(items),
      scope: flags.scope ?? `fixture:${flags.fixturePath}`,
    };
  }

  const key = Deno.env.get("FRACTTAL_KEY");
  const secret = Deno.env.get("FRACTTAL_SECRET");
  if (!key || !secret) {
    throw new Error(
      "FRACTTAL_KEY/FRACTTAL_SECRET required (prod tenant, reviewed; never committed)",
    );
  }
  if (!flags.locationCode) {
    throw new Error("--location-code <station> required in --live mode");
  }
  const client = createFracttalClient({
    baseUrl: flags.baseUrl,
    credentials: { key, secret },
  });
  return {
    source: async () => {
      const { rows, total } = await client.listRawItems({
        locationCode: flags.locationCode,
        itemType: flags.itemType,
        limit: 100,
      });
      console.log(
        `[fracttal-sync] live fetch: ${rows.length} rows (of ${total}) at ` +
          `location_code=${flags.locationCode}`,
      );
      return rows;
    },
    scope: flags.scope ?? `fracttal-live:${flags.locationCode}`,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  const { source, scope } = await sourceFor(flags);

  const notifiers: OpsNotifier[] = [consoleNotifier];
  const smtp = smtpConfigFromEnv();
  if (smtp) notifiers.push(smtpEmailNotifier(smtp));
  const startedAt = new Date();

  let result: SyncResult;
  try {
    result = await runSync(source, { scope, dryRun: !flags.apply });
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
