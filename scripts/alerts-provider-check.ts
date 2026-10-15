// scripts/alerts-provider-check.ts
// Pre-flight check for the alert provider (msgflow) before production use.
// Validates env, pings the provider, checks the DB tables/recipients/rules,
// and optionally sends one real test alert through postAlert.
//
//   deno run -A --env-file=.env scripts/alerts-provider-check.ts
//   deno run -A --env-file=.env scripts/alerts-provider-check.ts --send-test
//
// Exit 0 when every check passes; exit 1 on any failure.

import {
  buildAlertPayload,
  pingProvider,
  postAlert,
  type ProviderConfig,
  providerConfigFromEnv,
} from "../lib/server/alerts/provider.ts";

import { queryRows } from "../lib/server/db.ts";

import { log } from "../lib/server/log.ts";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  fatal?: boolean;
}

const checks: Check[] = [];

function check(
  name: string,
  ok: boolean,
  detail = "",
  fatal = false,
): void {
  checks.push({ name, ok, detail, fatal });
  log.child({ scope: "alerts-provider-check" }).info(
    `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`,
  );
}

async function main(): Promise<void> {
  const sendTest = Deno.args.includes("--send-test");
  let failed = 0;

  // --- 1. Environment ---
  const baseUrl = Deno.env.get("ALERT_PROVIDER_BASE_URL") ?? "";
  const token = Deno.env.get("ALERT_PROVIDER_TOKEN") ?? "";
  const companyIdRaw = Deno.env.get("ALERT_PROVIDER_COMPANY_ID") ?? "1";
  const companyId = Number(companyIdRaw) || 1;
  const databaseUrl = Deno.env.get("DATABASE_URL") ?? "";
  const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";
  const pollSeconds = Deno.env.get("ALERTS_POLL_SECONDS") ?? "900";

  check(
    "ALERT_PROVIDER_BASE_URL set",
    baseUrl !== "",
    baseUrl || "(unset)",
    true,
  );
  check(
    "ALERT_PROVIDER_TOKEN set",
    token !== "",
    token ? "****" : "(unset)",
    true,
  );
  check(
    "ALERT_PROVIDER_COMPANY_ID numeric",
    Number.isFinite(companyId) && companyId > 0,
    String(companyId),
    true,
  );
  check(
    "DATABASE_URL set",
    databaseUrl !== "",
    databaseUrl ? "****" : "(unset)",
    true,
  );
  check(
    "APP_BASE_URL set (recommended)",
    appBaseUrl !== "",
    appBaseUrl || "(unset - alert links omitted)",
    false,
  );
  check(
    "ALERTS_POLL_SECONDS >= 60",
    Number.isFinite(Number(pollSeconds)) && Number(pollSeconds) >= 60,
    pollSeconds,
    false,
  );

  // --- 2. Provider config + ping ---
  let config: ProviderConfig | null = null;
  try {
    config = providerConfigFromEnv();
    check(
      "provider config from env",
      true,
      `${config.baseUrl} company=${config.companyId}`,
      true,
    );
  } catch (err) {
    check(
      "provider config from env",
      false,
      err instanceof Error ? err.message : String(err),
      true,
    );
  }

  if (config) {
    try {
      const ping = await pingProvider(config);
      check(
        "provider ping ok",
        ping.ok,
        ping.ok ? "reachable" : "unreachable",
        true,
      );
      check(
        "provider pronto",
        ping.pronto,
        ping.pronto ? "ready" : "not ready",
        true,
      );
      if (ping.rotacao) {
        log.child({ scope: "alerts-provider-check" }).warn(
          "token rotation notice present",
          { rotacao: ping.rotacao },
        );
      }
    } catch (err) {
      check(
        "provider ping ok",
        false,
        err instanceof Error ? err.message : String(err),
        true,
      );
    }
  }

  // --- 3. Database ---
  let dbOk = false;
  if (databaseUrl) {
    try {
      await queryRows<{ c: number }>("select 1 as c");
      dbOk = true;
      check("database reachable", true, "DATABASE_URL connects", true);
    } catch (err) {
      check(
        "database reachable",
        false,
        err instanceof Error ? err.message : String(err),
        true,
      );
    }

    const requiredTables = [
      "availability_statuses",
      "alert_events",
      "alert_recipients",
      "alert_rules",
      "barriers",
    ];
    for (const table of requiredTables) {
      try {
        const rows = await queryRows<{ exists: boolean }>(
          `select exists (select 1 from information_schema.tables where table_name = $1) as exists`,
          [table],
        );
        check(`table ${table} exists`, rows[0]!.exists, "", true);
      } catch (err) {
        check(
          `table ${table} exists`,
          false,
          err instanceof Error ? err.message : String(err),
          true,
        );
      }
    }

    try {
      const rows = await queryRows<{ n: number }>(
        "select count(*)::int as n from alert_recipients where active",
      );
      const n = rows[0]!.n;
      check("active recipients exist", n > 0, `${n} active`, false);
    } catch (err) {
      check(
        "active recipients exist",
        false,
        err instanceof Error ? err.message : String(err),
        false,
      );
    }

    try {
      const rows = await queryRows<{ n: number }>(
        "select count(*)::int as n from alert_rules",
      );
      const n = rows[0]!.n;
      check(
        "alert rules configured",
        n > 0,
        `${n} rules (0 = legacy digest for all non-compliant)`,
        false,
      );
    } catch (err) {
      check(
        "alert rules configured",
        false,
        err instanceof Error ? err.message : String(err),
        false,
      );
    }
  }

  // --- 4. Optional: send one real test alert ---
  if (sendTest) {
    if (!config || !dbOk) {
      check(
        "send-test skipped",
        false,
        "provider config or database not ready",
        false,
      );
    } else {
      try {
        const payload = buildAlertPayload({
          barrierId: 0,
          externalCode: "CHECK-001",
          tag: "CHECK-001",
          criticality: "A",
          statusLabel: "Indisponivel",
          locationLabel: "CHECK-LOC",
          transitionDate: new Date().toISOString().slice(0, 10),
          ocorridoEm: new Date().toISOString(),
          statusId: 5,
          companyId,
          link: appBaseUrl ? `${appBaseUrl}/` : undefined,
          recipients: [{ email: "check@example.com", phone: "" }],
        });
        if (!payload) {
          check(
            "send-test payload",
            false,
            "payload was null (suppressed)",
            false,
          );
        } else {
          const accept = await postAlert(config, payload);
          check(
            "send-test posted",
            accept.ok,
            accept.mensagem || `evento=${accept.evento_id}`,
            false,
          );
        }
      } catch (err) {
        check(
          "send-test posted",
          false,
          err instanceof Error ? err.message : String(err),
          false,
        );
      }
    }
  }

  // --- Summary ---
  const fatals = checks.filter((c) => c.fatal && !c.ok).length;
  const nonFatals = checks.filter((c) => !c.fatal && !c.ok).length;
  failed = fatals + nonFatals;

  console.log(
    "\n═════════════════════════════════════════════════════════════════",
  );
  console.log(
    `alerts-provider-check: ${checks.length} checks, ${failed} failure(s)`,
  );
  if (failed === 0) {
    console.log("RESULT: READY for production alert delivery");
  } else {
    console.log(
      "RESULT: NOT READY - fix the FAIL checks above before deploying",
    );
    console.log(`  ${fatals} fatal, ${nonFatals} non-fatal`);
  }
  console.log(
    "═════════════════════════════════════════════════════════════════\n",
  );

  Deno.exit(failed === 0 ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
