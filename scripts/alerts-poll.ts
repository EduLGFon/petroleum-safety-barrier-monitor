// Alerts poll script - scheduled provider delivery ("cron in a container").
// Every ALERTS_POLL_SECONDS it detects, enqueues idempotently and posts
// one provider alert per event (same semantics as alerts-check --apply).
//
//   DATABASE_URL              required (alert store)
//   ALERTS_POLL_SECONDS       pause between cycles (default 900, minimum 60)
//   ALERT_PROVIDER_BASE_URL / ALERT_PROVIDER_TOKEN / ALERT_PROVIDER_COMPANY_ID
//   APP_BASE_URL              public link base for provider messages
//                             without a provider token the loop still runs
//                             in dry-run (detect + report only) so
//                             misconfiguration is visible in the logs.
import {
  consoleNotifier,
  notifyFailureToAll,
  type OpsNotifier,
  smtpConfigFromEnv,
  smtpEmailNotifier,
} from "../lib/server/fracttal/notify.ts";

import {
  postAlert,
  type ProviderConfig,
  providerConfigFromEnv,
} from "../lib/server/alerts/provider.ts";

import { getResolverLabels } from "../lib/server/sql/vocabularies.ts";

import { touchRuleTriggered } from "../lib/server/sql/alert_rules.ts";

import { listStaleBarriers } from "../lib/server/sql/alert_rules.ts";

import { listAlertRules } from "../lib/server/sql/alert_rules.ts";

import type { StatusInfo } from "../lib/server/alerts/detect.ts";

import { getBarriersByIds } from "../lib/server/sql/barriers.ts";

import { listRecipients } from "../lib/server/sql/recipients.ts";

import { sqlAlertStore } from "../lib/server/sql/alerts.ts";

import { runProviderCycle } from "../lib/server/alerts/run-provider.ts";

import { queryRows } from "../lib/server/db.ts";

import { log } from "../lib/server/log.ts";

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
  provider: ProviderConfig | null,
  notifiers: OpsNotifier[],
  startedAt: Date,
  dashboardUrl: string | undefined,
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
  let recipients: Array<{ email: string; name: string; phone: string }>;
  let rules: Awaited<ReturnType<typeof listAlertRules>> = [];
  try {
    recipients = (await listRecipients(true)).map((r) => ({
      email: r.email,
      name: r.name,
      phone: r.phone ?? "",
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
  const dryRun = provider === null;
  try {
    const result = await runProviderCycle({
      store: sqlAlertStore,
      loadBarriers: getBarriersByIds,
      sender: provider
        ? { post: (payload) => postAlert(provider, payload) }
        : { post: () => Promise.reject(new Error("dry-run")) },
      recipients,
      companyId: provider?.companyId ?? 1,
      appBaseUrl: dashboardUrl,
      dryRun,
      logger: log.line("info"),
      rules,
      hasAnyRule: rules.length > 0,
      listStale: (days) => listStaleBarriers(days),
      labels,
      statusInfo,
      onRuleFired: (ruleId) => {
        void touchRuleTriggered(ruleId).catch(() => {});
      },
    });
    console.log(
      `[alerts-poll] done detected=${result.detected} ` +
        `enqueued=${result.enqueued} sent=${result.sent} ` +
        `failed=${result.failed} parked=${result.skippedDead} ` +
        `posted=${result.posted} parcial=${result.parcial}`,
    );
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }
}

function main(): void {
  const notifiers: OpsNotifier[] = [consoleNotifier];
  const opsSmtp = smtpConfigFromEnv();
  if (opsSmtp) notifiers.push(smtpEmailNotifier(opsSmtp));
  let provider: ProviderConfig | null;
  try {
    provider = providerConfigFromEnv();
  } catch {
    provider = null;
  }
  const dashboardUrl = Deno.env.get("APP_BASE_URL") || undefined;
  console.log(
    `[alerts-poll] every ${seconds}s, provider=${
      provider ? "configured" : "dry-run (no token)"
    } ` +
      `notifiers=console${opsSmtp ? ",email" : ""}`,
  );
  if (!provider) {
    console.warn(
      "[alerts-poll] ALERT_PROVIDER_TOKEN is not set: cycles detect and report only, " +
        "nothing is enqueued or posted.",
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
      await cycle(provider, notifiers, new Date(), dashboardUrl);
      if (running) await sleep(seconds * 1000);
    }
    Deno.exit(0);
  })();
}

if (import.meta.main) {
  main();
}
