// alerts-check: detect barrier transitions allowed by alert rules,
// enqueue idempotently, send one digest per active recipient. Dry-run by
// default (detects and reports, writes nothing, sends nothing); --apply
// writes and sends. --reprocess clears dead-letter flags so failed events
// retry; --only-barrier scopes detection to one id (verification support).
//
// Env: DATABASE_URL (store), OPS_SMTP_* (relay, same P3 variables as ops
// mail), FRACTTAL_* not needed. Exit 0 when the run completes (counts in
// the log, even with dead-letters); exit 1 on unexpected failure (DB down,
// no relay when sending) after notifying ops.
import {
  consoleNotifier,
  notifyFailureToAll,
  type OpsNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import {
  smtpAlertConfigFromEnv,
  smtpAlertMailer,
} from "../lib/server/alerts/mailer.ts";

import { getResolverLabels } from "../lib/server/sql/vocabularies.ts";

import { listStaleBarriers } from "../lib/server/sql/alert_rules.ts";

import { listAlertRules } from "../lib/server/sql/alert_rules.ts";

import { getBarriersByIds } from "../lib/server/sql/barriers.ts";

import { listRecipients } from "../lib/server/sql/recipients.ts";

import type { StatusInfo } from "../lib/server/alerts/detect.ts";

import { sqlAlertStore } from "../lib/server/sql/alerts.ts";

import { runAlertCycle } from "../lib/server/alerts/run.ts";

import { queryRows } from "../lib/server/db.ts";

interface Flags {
  apply: boolean;
  reprocess: boolean;
  onlyBarrier: number | undefined;
  json: boolean;
}

function parseFlags(args: string[]): Flags {
  let apply = false;
  let reprocess = false;
  let onlyBarrier: number | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--apply") apply = true;
    else if (a === "--reprocess") reprocess = true;
    else if (a === "--json") json = true;
    else if (a === "--only-barrier") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--only-barrier <id> needs a positive integer");
      }
      onlyBarrier = n;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "usage: alerts-check.ts [--apply] [--reprocess] [--only-barrier <id>] [--json]",
      );
      Deno.exit(0);
    } else {
      throw new Error(`unknown flag ${a} (see --help)`);
    }
  }
  return { apply, reprocess, onlyBarrier, json };
}

async function main(): Promise<void> {
  const flags = parseFlags(Deno.args);
  const startedAt = new Date();
  const notifiers: OpsNotifier[] = [consoleNotifier];
  const opsSmtp = smtpConfigFromEnv();
  if (opsSmtp) notifiers.push(smtpEmailNotifier(opsSmtp));
  const fail = async (note: string): Promise<never> => {
    await notifyFailureToAll(notifiers, {
      scope: "alerts",
      startedAt: startedAt.toISOString(),
      note,
      runId: null,
    });
    console.error(`[alerts-check] ${note}`);
    Deno.exit(1);
  };

  let recipients: Array<{ email: string }>;
  let rules: Awaited<ReturnType<typeof listAlertRules>> = [];
  try {
    recipients = (await listRecipients(true)).map((r) => ({
      email: r.email,
    }));
    rules = await listAlertRules(false);
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }

  const dryRun = !flags.apply;
  const mailer = dryRun
    ? { name: "none" as const, send: () => Promise.resolve() }
    : smtpAlertMailer(smtpAlertConfigFromEnv());
  // Display labels (authors included) so enqueued payloads carry real names;
  // best-effort: without them the seed-enum fallback still renders.
  let labels: Awaited<ReturnType<typeof getResolverLabels>> | undefined;
  try {
    labels = await getResolverLabels();
  } catch {
    labels = undefined;
  }
  // Authoritative status labels/compliance so detection judges the landing
  // status even when the barrier has since moved on (sync reverts); falls
  // back to the seed-enum mapping inside detect.ts when unavailable.
  let statusInfo: StatusInfo | undefined;
  try {
    const rows = await queryRows<{ id: number; label: string; ok: boolean }>(
      `select id, label, is_compliant as ok from availability_statuses`,
    );
    const labelById = new Map(rows.map((r) => [r.id, r.label]));
    const okById = new Map(rows.map((r) => [r.id, r.ok]));
    statusInfo = {
      labelOf: (id) => labelById.get(id) ?? `Disponibilidade (${id})`,
      compliantOf: (id) => okById.get(id) ?? false,
    };
  } catch {
    statusInfo = undefined;
  }
  const brand = Deno.env.get("COMPANY_NAME") || undefined;
  try {
    const result = await runAlertCycle({
      store: sqlAlertStore,
      loadBarriers: getBarriersByIds,
      mailer,
      recipients: recipients!,
      onlyBarrierIds: flags.onlyBarrier === undefined
        ? undefined
        : [flags.onlyBarrier],
      dryRun,
      reprocess: flags.reprocess,
      logger: (line) => console.log(line),
      rules: rules!,
      hasAnyRule: (rules?.length ?? 0) > 0,
      listStale: (days) => listStaleBarriers(days),
      labels,
      brand,
      statusInfo,
    });
    if (flags.json) console.log(JSON.stringify(result));
    else {
      console.log(
        `[alerts-check] done detected=${result.detected} ` +
          `enqueued=${result.enqueued} sent=${result.sent} ` +
          `failed=${result.failed} parked=${result.skippedDead} ` +
          `emails=${result.emails} reprocessed=${result.reprocessed}`,
      );
    }
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }
}

if (import.meta.main) {
  await main();
}
