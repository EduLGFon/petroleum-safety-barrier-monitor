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

// failureBody: the flat audit-style email body (plain text, CRLF-safe).
export function failureBody(info: SyncFailureInfo): string {
  return [
    "Fracttal sync run FAILED.",
    "",
    `scope:    ${info.scope}`,
    `started:  ${info.startedAt}`,
    `runId:    ${info.runId ?? "(not recorded)"}`,
    "",
    `error: ${info.note}`,
    "",
    "The run was recorded as failed in sync_state. The next poll will retry",
    "this scope; investigate if it recurs.",
  ].join("\n");
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
      const subject = `[Barrier Monitor] Fracttal sync failed (${info.scope})`;
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
