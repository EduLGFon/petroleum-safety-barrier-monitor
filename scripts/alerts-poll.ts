// Alerts poll script - scheduled digest delivery ("cron in a container").
// This is why it exists: alert rules are digest-type by default
// (notify_immediate=false), so transitions only enqueue at PATCH time and
// the email only goes out when something runs the cycle with --apply. This
// loop is that something: every ALERTS_POLL_SECONDS it detects, enqueues
// idempotently and sends one digest per active recipient (same semantics
// as scripts/alerts-check.ts --apply, wired identically). Env only.
//
//   DATABASE_URL              required (alert store)
//   ALERTS_POLL_SECONDS       pause between cycles (default 900, minimum 60;
//                             effective period is cycle + pause)
//   OPS_SMTP_HOST / OPS_SMTP_PORT / OPS_SMTP_USER / OPS_SMTP_PASS
//   OPS_EMAIL_TO / OPS_EMAIL_FROM / COMPANY_NAME
//                             relay for the digest; without OPS_SMTP_HOST the
//                             loop still runs in dry-run (detect + report, no
//                             writes, no mail) so misconfiguration is visible
//                             in the logs instead of silent.
import {
  consoleNotifier,
  notifyFailureToAll,
  type OpsNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import {
  type AlertMailer,
  smtpAlertConfigFromEnv,
  smtpAlertMailer,
} from "../lib/server/alerts/mailer.ts";

import type { StatusInfo } from "../lib/server/alerts/detect.ts";

import { queryRows } from "../lib/server/db.ts";

import { listStaleBarriers } from "../lib/server/sql/alert_rules.ts";

import { listAlertRules } from "../lib/server/sql/alert_rules.ts";

import { getResolverLabels } from "../lib/server/sql/vocabularies.ts";

import { getBarriersByIds } from "../lib/server/sql/barriers.ts";

import { listRecipients } from "../lib/server/sql/recipients.ts";

import { sqlAlertStore } from "../lib/server/sql/alerts.ts";

import { runAlertCycle } from "../lib/server/alerts/run.ts";

const seconds = Math.max(
  60,
  Math.floor(Number(Deno.env.get("ALERTS_POLL_SECONDS")) || 900),
);

let running = true;
let wake: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    wake = () => {
      clearTimeout(timer);
      wake = null;
      resolve();
    };
  });
}

async function loadStatusInfo(): Promise<StatusInfo | undefined> {
  try {
    const rows = await queryRows<{ id: number; label: string; ok: boolean }>(
      `select id, label, is_compliant as ok from availability_statuses`,
    );
    const labelById = new Map(rows.map((r) => [r.id, r.label]));
    const okById = new Map(rows.map((r) => [r.id, r.ok]));
    return {
      labelOf: (id) => labelById.get(id) ?? `Disponibilidade (${id})`,
      compliantOf: (id) => okById.get(id) ?? false,
    };
  } catch {
    return undefined;
  }
}

async function cycle(
  mailer: AlertMailer | null,
  notifiers: OpsNotifier[],
  startedAt: Date,
  brand: string | undefined,
): Promise<void> {
  const fail = async (note: string): Promise<void> => {
    await notifyFailureToAll(notifiers, {
      scope: "alerts",
      startedAt: startedAt.toISOString(),
      note,
      runId: null,
    });
    console.error(`[alerts-poll] ${note}`);
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
    return;
  }
  let labels: Awaited<ReturnType<typeof getResolverLabels>> | undefined;
  try {
    labels = await getResolverLabels();
  } catch {
    labels = undefined;
  }
  const statusInfo = await loadStatusInfo();
  const dryRun = mailer === null;
  try {
    const result = await runAlertCycle({
      store: sqlAlertStore,
      loadBarriers: getBarriersByIds,
      mailer: mailer ??
        { name: "none" as const, send: () => Promise.resolve() },
      recipients,
      dryRun,
      logger: (line) => console.log(line),
      rules,
      hasAnyRule: rules.length > 0,
      listStale: (days) => listStaleBarriers(days),
      labels,
      brand,
      statusInfo,
    });
    console.log(
      `[alerts-poll] done detected=${result.detected} ` +
        `enqueued=${result.enqueued} sent=${result.sent} ` +
        `failed=${result.failed} parked=${result.skippedDead} ` +
        `emails=${result.emails}`,
    );
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }
}

function main(): void {
  const notifiers: OpsNotifier[] = [consoleNotifier];
  const opsSmtp = smtpConfigFromEnv();
  if (opsSmtp) notifiers.push(smtpEmailNotifier(opsSmtp));
  let mailer: AlertMailer | null;
  try {
    mailer = smtpAlertMailer(smtpAlertConfigFromEnv());
  } catch {
    mailer = null;
  }
  const brand = Deno.env.get("COMPANY_NAME") || undefined;
  console.log(
    `[alerts-poll] every ${seconds}s, mail=${
      mailer ? "smtp" : "dry-run (no relay)"
    } ` +
      `notifiers=console${opsSmtp ? ",email" : ""}` +
      (brand ? ` brand=${brand}` : ""),
  );
  if (!mailer) {
    console.warn(
      "[alerts-poll] OPS_SMTP_HOST is not set: cycles detect and report only, " +
        "nothing is enqueued or mailed. Set the relay to deliver digests.",
    );
  }
  const stop = () => {
    console.log("[alerts-poll] stopping (waits for the in-flight cycle)");
    running = false;
    wake?.();
  };
  Deno.addSignalListener("SIGINT", stop);
  Deno.addSignalListener("SIGTERM", stop);
  (async () => {
    while (running) {
      await cycle(mailer, notifiers, new Date(), brand);
      if (running) await sleep(seconds * 1000);
    }
    Deno.exit(0);
  })();
}

if (import.meta.main) {
  main();
}
