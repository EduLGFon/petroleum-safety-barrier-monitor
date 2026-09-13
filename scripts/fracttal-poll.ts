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
//   OPS_SMTP_HOST / OPS_SMTP_PORT / OPS_SMTP_USER / OPS_SMTP_PASS
//   OPS_EMAIL_TO / OPS_EMAIL_FROM        emails are optional; without them
//                                         failures still log via [ops] console
import {
  consoleNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

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

  // run: one bounded live GET per scope, then the standard runSync pipeline
  // (writes are intended here - this is the production cadence).
  const loops = flags.scopes.map((locationCode) => {
    return createPollLoop(`fracttal-live:${locationCode}`, {
      run: async () => {
        const { rows } = await client.listRawItems({
          locationCode,
          itemType: flags.itemType,
          limit: 100,
        });
        console.log(
          `[fracttal-poll] ${locationCode}: fetched ${rows.length} rows`,
        );
        return await runSync(() => Promise.resolve(rows), {
          scope: `fracttal-live:${locationCode}`,
          dryRun: false,
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
      `(item_type=${flags.itemType})`,
  );
}

if (import.meta.main) {
  main();
}
