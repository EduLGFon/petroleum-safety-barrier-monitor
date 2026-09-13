// Alert mailer - one interface, one provider (SMTP), retry with backoff.
// This is why it exists: the alert cycle must not care how mail is sent
// (tests inject a fake, prod uses SMTP), and a single failed send must not
// lose the event - sendWithRetry rethrows only after the policy is spent,
// letting the cycle dead-letter the event with the error attached.
import { sendMail, type SmtpConfig } from "../fracttal/smtp.ts";

export interface AlertMailer {
  name: string;
  send(to: string[], subject: string, body: string): Promise<void>;
}

export type MailSend = (
  config: SmtpConfig,
  subject: string,
  body: string,
) => Promise<void>;

// smtpAlertMailer: the one provider, over the P3 SMTP client. One SMTP
// session per recipient - the audience is small and per-recipient sessions
// keep delivery failures attributable.
export function smtpAlertMailer(
  config: SmtpConfig,
  sendImpl: MailSend = sendMail,
): AlertMailer {
  return {
    name: "smtp",
    async send(to: string[], subject: string, body: string): Promise<void> {
      for (const address of to) {
        await sendImpl({ ...config, to: address }, subject, body);
      }
    },
  };
}

// smtpAlertConfigFromEnv: reuses the P3 OPS_SMTP_* variables (same relay as
// ops mail). Host is required; from falls back to the user, then a
// host-based default so a missing OPS_EMAIL_FROM never blocks sending.
export function smtpAlertConfigFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
): SmtpConfig {
  const hostname = get("OPS_SMTP_HOST");
  if (!hostname) {
    throw new Error(
      "OPS_SMTP_HOST is not set (alert mail needs the P3 SMTP relay).",
    );
  }
  const user = get("OPS_SMTP_USER");
  return {
    hostname,
    port: Number(get("OPS_SMTP_PORT")) || 587,
    user,
    pass: get("OPS_SMTP_PASS"),
    from: get("OPS_EMAIL_FROM") ?? user ?? `barrier-monitor@${hostname}`,
    to: "",
  };
}

export interface RetryPolicy {
  attempts: number;
  backoffMs: number[];
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// sendWithRetry: attempts total tries, sleeping backoffMs[i] before retry
// i+1 (no wait before the first try). Rethrows the last error when spent.
export async function sendWithRetry(
  mailer: AlertMailer,
  to: string[],
  subject: string,
  body: string,
  policy: Partial<RetryPolicy> = {},
): Promise<void> {
  const attempts = policy.attempts ?? 3;
  const backoffMs = policy.backoffMs ?? [2_000, 8_000];
  const sleep = policy.sleep ?? defaultSleep;
  let last: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await mailer.send(to, subject, body);
      return;
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(backoffMs[i] ?? 8_000);
    }
  }
  throw last;
}
