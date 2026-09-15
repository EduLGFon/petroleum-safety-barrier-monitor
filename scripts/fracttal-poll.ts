// Fracttal poll script (P3) - production polling cadence, "polling first".
// This is why it exists: SPRINTS P3 targets a poll cadence before webhooks.
// Env-driven and safe by construction: one bounded live GET per scope, a
// per-scope lock (syncScopeRunning) so runs never overlap, and failures land
// in sync_state + notify ops (console, plus OPS_SMTP_* email when configured).
//
//   FRACTTAL_KEY / FRACTTAL_SECRET      required (prod tenant, reviewed)
//   FRACTTAL_BASE_URL                    optional (default app.fracttal.com/api)
//   FRACTTAL_SYNC_SCOPES                comma-separated location codes to poll
//   FRACTTAL_POLL_SECONDS                cadence (default 300)
//   FRACTTAL_SYNC_ITEM_TYPE              default 2 (Equipment)
//   FRACTTAL_SYNC_MAX_PAGES              item pages per scope per tick
//                                        (default 40 x 100 rows; a scope that
//                                        needs more aborts loudly - raise it)
//   FRACTTAL_WORK_DATE_GTE               optional date[gte] floor for the
//                                        work-orders status pass
//   OPS_SMTP_HOST / OPS_SMTP_PORT / OPS_SMTP_USER / OPS_SMTP_PASS
//   OPS_EMAIL_TO / OPS_EMAIL_FROM        emails are optional; without them
//                                         failures still log via [ops] console
import {
  consoleNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import { fetchScopeSignals } from "../lib/server/fracttal/live-scope.ts";

import { createFracttalClient } from "../lib/server/fracttal/client.ts";

import type { ItemTypeValue } from "../lib/server/fracttal/itemType.ts";

import type { OpsNotifier } from "../lib/server/fracttal/notify.ts";

import { createPollLoop } from "../lib/server/fracttal/runner.ts";

import { syncScopeRunning } from "../lib/server/sql/sync.ts";

import { runSync } from "../lib/server/fracttal/sync.ts";

import { loadSyncConfig } from "../lib/server/config.ts";

const DEFAULT_BASE_URL = "https://app.fracttal.com/api";

interface PollFlags {
  scopes: string[];
  seconds: number;
  itemType: ItemTypeValue;
  maxPages: number;
  baseUrl: string;
}

function parseFlags(): PollFlags {
  const scopes = (Deno.env.get("FRACTTAL_SYNC_SCOPES") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    scopes,
    seconds: Math.max(5, Number(Deno.env.get("FRACTTAL_POLL_SECONDS")) || 300),
    itemType: (Number(Deno.env.get("FRACTTAL_SYNC_ITEM_TYPE")) ||
      2) as ItemTypeValue,
    maxPages: Math.max(
      1,
      Math.floor(Number(Deno.env.get("FRACTTAL_SYNC_MAX_PAGES")) || 40),
    ),
    baseUrl: Deno.env.get("FRACTTAL_BASE_URL") ?? DEFAULT_BASE_URL,
  };
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
  if (flags.scopes.length === 0) {
    console.error(
      "[fracttal-poll] FRACTTAL_SYNC_SCOPES required (comma-separated location codes)",
    );
    Deno.exit(2);
  }

  const client = createFracttalClient({
    baseUrl: flags.baseUrl,
    credentials: { key, secret },
  });

  const notifiers: OpsNotifier[] = [consoleNotifier];
  const smtp = smtpConfigFromEnv();
  if (smtp) notifiers.push(smtpEmailNotifier(smtp));

  // run: complete item pages per scope (guarded, fail-closed) plus the
  // work-order status pass, then the standard runSync pipeline (writes are
  // intended here - this is the production cadence). A truncated scope or a
  // work-endpoint failure throws before runSync starts, so the tick notifies
  // ops with zero writes instead of deleting or decaying rows. The status
  // pass is one recent page per work endpoint; a full backfill is the
  // import rebuild, not the poll loop.
  const dateGte = Deno.env.get("FRACTTAL_WORK_DATE_GTE") ?? undefined;
  const loops = flags.scopes.map((locationCode) => {
    return createPollLoop(`fracttal-live:${locationCode}`, {
      run: async () => {
        const fetched = await fetchScopeSignals(client, {
          locationCode,
          itemType: flags.itemType,
          maxPages: flags.maxPages,
          dateGte,
        });
        console.log(
          `[fracttal-poll] ${locationCode}: fetched ${fetched.itemRows.length} items ` +
            `(${fetched.pagesFetched} pages), ${fetched.workOrders} orders, ` +
            `${fetched.workRequests} requests`,
        );
        return await runSync(() => Promise.resolve(fetched.itemRows), {
          scope: `fracttal-live:${locationCode}`,
          dryRun: false,
          workEvents: fetched.workEvents,
        });
      },
      lock: {
        isRunning: (scope) => syncScopeRunning(scope),
      },
      notifiers,
      intervalMs: flags.seconds * 1000,
    });
  });

  const stop = async (): Promise<void> => {
    console.log("[fracttal-poll] stopping");
    await Promise.all(loops.map((l) => l.stop()));
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", () => void stop());
  Deno.addSignalListener("SIGTERM", () => void stop());

  loops.forEach((l) => l.start());
  console.log(
    `[fracttal-poll] polling ${
      flags.scopes.join(", ")
    } every ${flags.seconds}s ` +
      `(item_type=${flags.itemType}, max_pages=${flags.maxPages})`,
  );
}

if (import.meta.main) {
  main();
}
