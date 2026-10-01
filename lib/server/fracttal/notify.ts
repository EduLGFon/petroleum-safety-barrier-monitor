// Ops notifications for sync failures (P3) - failures never go silent.
// This is why it exists: P3 requires sync failures to reach ops separately
// from barrier alerts. The console channel always runs; the email channel is
// optional and env-gated (OPS_SMTP_*/OPS_EMAIL_TO). Notification is
// best-effort by contract: a throwing notifier never propagates into the
// sync path, so an unusable mail relay cannot take down the pipeline.
import { sendMail, type SmtpConfig } from "./smtp.ts";

export interface SyncFailureInfo {
  scope: string;
  startedAt: string; // ISO timestamp (run start)
  note: string;
  runId: number | null;
}

export interface OpsNotifier {
  name: string;
  syncFailed(info: SyncFailureInfo): Promise<void>;
}

// consoleNotifier: the always-available channel (loud, structured line).
export const consoleNotifier: OpsNotifier = {
  name: "console",
  syncFailed(info: SyncFailureInfo): Promise<void> {
    console.error(
      `[ops] sync failed scope=${info.scope} runId=${info.runId ?? "-"} ` +
        `startedAt=${info.startedAt} note=${info.note}`,
    );
    return Promise.resolve();
  },
};

// formatStartedPtBr: ISO start plus a pt-BR rendering for ops readers.
// Pure and total: an unparsable ISO falls back to the raw value.
function formatStartedPtBr(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(time));
  return `${iso} (${formatted} UTC)`;
}

// hintForNote: short Portuguese cause/fix for known failure signatures.
// Returns null when the error has no known pattern.
function hintForNote(note: string): string | null {
  if (/column .* does not exist/i.test(note)) {
    return "Causa provável: banco sem a migração. Rode `deno task db:migrate` " +
      "e confira a tabela (para o escopo alerts, a coluna description de alert_rules).";
  }
  return null;
}

// failureBody: the flat audit-style email body (plain text, CRLF-safe).
// User-facing copy is pt-BR; identifiers (scope, runId, sync_state) stay in
// English per docs/GLOSSARY.md.
export function failureBody(info: SyncFailureInfo): string {
  const lines = [
    "Falha na sincronização Fracttal.",
    "",
    `escopo:    ${info.scope}`,
    `início:    ${formatStartedPtBr(info.startedAt)}`,
    `execução (runId): ${info.runId ?? "(não registrada)"}`,
    "",
    `erro: ${info.note}`,
  ];
  const hint = hintForNote(info.note);
  if (hint !== null) lines.push("", hint);
  lines.push(
    "",
    "A execução foi registrada como falha em sync_state. A próxima",
    "verificação vai tentar este escopo de novo.",
    "",
    "Como investigar:",
    "- últimas falhas: select scope, status, note, started_at, finished_at",
    "  from sync_state where status = 'failed' order by id desc limit 10;",
    "- logs do poller: docker compose logs poller",
    "- investigue se o erro se repetir.",
  );
  return lines.join("\n");
}

// smtpEmailNotifier: optional channel; every failure sends one email. The
// SMTP send itself is best-effort (see module header) - callers still use
// notifyFailureToAll with a swallow guard.
export function smtpEmailNotifier(
  config: SmtpConfig,
  sendImpl: (
    config: SmtpConfig,
    subject: string,
    body: string,
  ) => Promise<void> = sendMail,
): OpsNotifier {
  return {
    name: "email",
    async syncFailed(info: SyncFailureInfo): Promise<void> {
      const subject =
        `[Barrier Monitor] Falha na sincronização Fracttal (${info.scope})`;
      await sendImpl(config, subject, failureBody(info));
    },
  };
}

// smtpConfigFromEnv: null when the optional channel is unconfigured. Port 465
// implies implicit TLS; any other port starts plain and upgrades via STARTTLS.
// MAIL_USER/MAIL_PASS (and MAIL_HOST) are accepted as aliases for the
// OPS_SMTP_* pair, and from falls back to the authenticated user so
// Gmail/Outlook (which reject foreign From addresses) work out of the box.
export function smtpConfigFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
): SmtpConfig | null {
  const hostname = get("OPS_SMTP_HOST") ?? get("MAIL_HOST");
  const to = get("OPS_EMAIL_TO");
  if (!hostname || !to) return null;
  const port = Number(get("OPS_SMTP_PORT") ?? 587);
  const user = get("OPS_SMTP_USER") ?? get("MAIL_USER");
  return {
    hostname,
    port,
    secure: port === 465,
    user,
    pass: get("OPS_SMTP_PASS") ?? get("MAIL_PASS"),
    from: get("OPS_EMAIL_FROM") ?? user ?? "barrier-monitor@local",
    to,
  };
}

// notifyFailureToAll: fanout with a feed-through (one bad channel must not
// block the rest or the sync caller). Errors are logged, never thrown.
export async function notifyFailureToAll(
  notifiers: OpsNotifier[],
  info: SyncFailureInfo,
): Promise<void> {
  await Promise.all(
    notifiers.map(async (n) => {
      try {
        await n.syncFailed(info);
      } catch (err) {
        console.error(
          `[ops] notifier ${n.name} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }),
  );
}
