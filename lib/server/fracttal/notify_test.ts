// Unit tests for ops failure notifications (P3) - console always, email
// optional, and a throwing notifier must never break the fanout.
import {
  consoleNotifier,
  failureBody,
  notifyFailureToAll,
  smtpConfigFromEnv,
  smtpEmailNotifier,
  type SyncFailureInfo,
} from "./notify.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { SmtpConfig } from "./smtp.ts";

const info: SyncFailureInfo = {
  scope: "fracttal-live:FAL",
  startedAt: "2026-09-12T10:00:00.000Z",
  note: "upstream error 500",
  runId: 7,
};

Deno.test("consoleNotifier emits a loud structured line", async () => {
  const calls: string[] = [];
  const original = console.error;
  console.error = (l: string) => calls.push(l);
  try {
    await consoleNotifier.syncFailed(info);
  } finally {
    console.error = original;
  }
  assertStrictEquals(calls.length, 1);
  assertStrictEquals(calls[0]!.includes("scope=fracttal-live:FAL"), true);
  assertStrictEquals(calls[0]!.includes("note=upstream error 500"), true);
});

Deno.test("smtpEmailNotifier sends one email with the failure details", async () => {
  const sent: Array<{ subject: string; body: string }> = [];
  const cfg: SmtpConfig = {
    hostname: "smtp.example.com",
    port: 587,
    from: "ops@example.com",
    to: "team@example.com",
  };
  const notifier = smtpEmailNotifier(
    cfg,
    (_c, subject, body) => {
      sent.push({ subject, body });
      return Promise.resolve();
    },
  );
  await notifier.syncFailed(info);
  assertStrictEquals(sent.length, 1);
  assertStrictEquals(
    sent[0]!.subject,
    "[Barrier Monitor] Fracttal sync failed (fracttal-live:FAL)",
  );
  assertStrictEquals(
    sent[0]!.body.includes("scope:    fracttal-live:FAL"),
    true,
  );
  assertStrictEquals(sent[0]!.body.includes("runId:    7"), true);
  assertStrictEquals(sent[0]!.body.includes("error: upstream error 500"), true);
});

Deno.test("failureBody renders a null runId as not-recorded", () => {
  const body = failureBody({ ...info, runId: null });
  assertStrictEquals(body.includes("(not recorded)"), true);
});

Deno.test("smtpConfigFromEnv is null unless host and recipient are set", () => {
  const get = (vals: Record<string, string>) => (k: string) => vals[k];
  assertStrictEquals(
    smtpConfigFromEnv(get({})),
    null,
  );
  const cfg = smtpConfigFromEnv(
    get({
      OPS_SMTP_HOST: "smtp.example.com",
      OPS_EMAIL_TO: "team@example.com",
    }),
  );
  assertStrictEquals(cfg !== null, true);
  assertStrictEquals(cfg!.hostname, "smtp.example.com");
  assertStrictEquals(cfg!.port, 587);
  assertStrictEquals(cfg!.secure, false);

  const tls = smtpConfigFromEnv(
    get({
      OPS_SMTP_HOST: "smtp.example.com",
      OPS_EMAIL_TO: "team@example.com",
      OPS_SMTP_PORT: "465",
    }),
  );
  assertStrictEquals(tls!.secure, true);
});

Deno.test("smtpConfigFromEnv falls back to MAIL_* aliases and user From", () => {
  const cfg = smtpConfigFromEnv((k) =>
    (
      {
        MAIL_HOST: "smtp.gmail.com",
        OPS_EMAIL_TO: "team@example.com",
        MAIL_USER: "you@gmail.com",
        MAIL_PASS: "sekret",
      } as Record<string, string>
    )[k]
  );
  assertStrictEquals(cfg!.hostname, "smtp.gmail.com");
  assertStrictEquals(cfg!.user, "you@gmail.com");
  assertStrictEquals(cfg!.pass, "sekret");
  assertStrictEquals(cfg!.from, "you@gmail.com");
});

Deno.test("notifyFailureToAll fans out and swallows a throwing notifier", async () => {
  const called: string[] = [];
  const bad = {
    name: "bad",
    syncFailed(): Promise<void> {
      throw new Error("relay down");
    },
  };
  const good = {
    name: "good",
    syncFailed(i: SyncFailureInfo) {
      called.push(i.scope);
      return Promise.resolve();
    },
  };
  const errors: string[] = [];
  const original = console.error;
  console.error = (l: string) => errors.push(l);
  try {
    await notifyFailureToAll([bad, good], info);
  } finally {
    console.error = original;
  }
  assertStrictEquals(called.join(","), "fracttal-live:FAL");
  assertStrictEquals(errors.length, 1);
  assertStrictEquals(errors[0]!.includes("relay down"), true);
});
