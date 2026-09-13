// Unit tests for ops failure notifications (P3) - console always, email
// optional, and a throwing notifier must never break the fanout.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import {
  consoleNotifier,
  failureBody,
  notifyFailureToAll,
  smtpConfigFromEnv,
  smtpEmailNotifier,
  type SyncFailureInfo,
} from "./notify.ts";
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
  const originals: Array<[string, string | undefined]> = [];
  const snapshot = (key: string) => {
    originals.push([key, Deno.env.get(key)]);
  };
  for (
    const key of [
      "OPS_SMTP_HOST",
      "OPS_SMTP_PORT",
      "OPS_SMTP_USER",
      "OPS_SMTP_PASS",
      "OPS_EMAIL_TO",
      "OPS_EMAIL_FROM",
    ]
  ) snapshot(key);

  Deno.env.delete("OPS_SMTP_HOST");
  Deno.env.delete("OPS_EMAIL_TO");
  try {
    assertStrictEquals(smtpConfigFromEnv(), null);

    Deno.env.set("OPS_SMTP_HOST", "smtp.example.com");
    Deno.env.set("OPS_EMAIL_TO", "team@example.com");
    Deno.env.delete("OPS_SMTP_PORT");
    const cfg = smtpConfigFromEnv();
    assertStrictEquals(cfg !== null, true);
    assertStrictEquals(cfg!.hostname, "smtp.example.com");
    assertStrictEquals(cfg!.port, 587);
    assertStrictEquals(cfg!.secure, false);

    Deno.env.set("OPS_SMTP_PORT", "465");
    assertStrictEquals(smtpConfigFromEnv()!.secure, true);
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
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
