// Unit tests for the alert mailer + templates (P5).
import { assertStrictEquals } from "jsr:@std/assert@^1";
import {
  type AlertMailer,
  sendWithRetry,
  smtpAlertConfigFromEnv,
  smtpAlertMailer,
} from "./mailer.ts";
import { urgentDigestBody, urgentDigestSubject } from "./templates.ts";

Deno.test("smtpAlertMailer sends one session per recipient", async () => {
  const sent: Array<{ to: string; subject: string }> = [];
  const mailer = smtpAlertMailer(
    {
      hostname: "h",
      port: 25,
      from: "from@x",
      to: "",
    },
    async (config, subject) => {
      sent.push({ to: config.to, subject });
      return await Promise.resolve();
    },
  );
  await mailer.send(["a@x", "b@x"], "s", "b");
  assertStrictEquals(sent.map((s) => s.to).join(","), "a@x,b@x");
});

Deno.test("smtpAlertConfigFromEnv requires the relay host", () => {
  let caught: Error | null = null;
  try {
    smtpAlertConfigFromEnv(() => undefined);
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  const cfg = smtpAlertConfigFromEnv((k) =>
    ({ OPS_SMTP_HOST: "relay", OPS_SMTP_USER: "u" } as Record<string, string>)[
      k
    ]
  );
  assertStrictEquals(cfg.hostname, "relay");
  assertStrictEquals(cfg.port, 587);
  assertStrictEquals(cfg.from, "u");
});

Deno.test("sendWithRetry succeeds first try without sleeping", async () => {
  let calls = 0;
  let slept = 0;
  const mailer: AlertMailer = {
    name: "fake",
    send: () => {
      calls++;
      return Promise.resolve();
    },
  };
  await sendWithRetry(mailer, ["a"], "s", "b", {
    sleep: () => {
      slept++;
      return Promise.resolve();
    },
  });
  assertStrictEquals(calls, 1);
  assertStrictEquals(slept, 0);
});

Deno.test("sendWithRetry retries then succeeds", async () => {
  let calls = 0;
  const waits: number[] = [];
  const mailer: AlertMailer = {
    name: "flaky",
    send: () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return Promise.resolve();
    },
  };
  await sendWithRetry(mailer, ["a"], "s", "b", {
    attempts: 3,
    backoffMs: [100, 200],
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  assertStrictEquals(calls, 3);
  assertStrictEquals(waits.join(","), "100,200");
});

Deno.test("sendWithRetry rethrows after the policy is spent", async () => {
  let calls = 0;
  const mailer: AlertMailer = {
    name: "down",
    send: () => {
      calls++;
      throw new Error("relay down");
    },
  };
  let caught: Error | null = null;
  try {
    await sendWithRetry(mailer, ["a"], "s", "b", {
      attempts: 2,
      sleep: () => Promise.resolve(),
    });
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(calls, 2);
  assertStrictEquals(caught?.message, "relay down");
});

Deno.test("urgentDigestSubject counts total and critical", () => {
  assertStrictEquals(
    urgentDigestSubject(1, 1),
    "[Barreiras] 1 barreira urgente (1 crítica)",
  );
  assertStrictEquals(
    urgentDigestSubject(3, 2),
    "[Barreiras] 3 barreiras urgentes (2 críticas)",
  );
  assertStrictEquals(
    urgentDigestSubject(2, 0),
    "[Barreiras] 2 barreiras urgentes",
  );
});

Deno.test("urgentDigestBody lists events with flags and run stamp", () => {
  const body = urgentDigestBody(
    [{
      tag: "FAL-EQ-001",
      instalacao: "FAL",
      disponibilidade: "Indisponível",
      criticidade: "Crítica",
      transitionDate: "2026-09-13",
      urgency: "critical",
    }],
    "2026-09-13T10:00:00Z",
  );
  assertStrictEquals(body.includes("[CRÍTICA] FAL-EQ-001 (FAL)"), true);
  assertStrictEquals(body.includes("desde 2026-09-13"), true);
  assertStrictEquals(body.includes("2026-09-13T10:00:00Z"), true);
});
