// Unit tests for the alert mailer + templates (P5).
import {
  type AlertMailer,
  sendWithRetry,
  smtpAlertConfigFromEnv,
  smtpAlertMailer,
} from "./mailer.ts";

import {
  escapeHtml,
  urgentDigestBody,
  urgentDigestHtml,
  urgentDigestSubject,
} from "./templates.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

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

Deno.test("smtpAlertConfigFromEnv accepts MAIL_* aliases and 465 implicit TLS", () => {
  const cfg = smtpAlertConfigFromEnv((k) =>
    (
      {
        MAIL_HOST: "smtp.office365.com",
        MAIL_USER: "you@outlook.com",
        MAIL_PASS: "sekret",
        OPS_SMTP_PORT: "465",
      } as Record<string, string>
    )[k]
  );
  assertStrictEquals(cfg.hostname, "smtp.office365.com");
  assertStrictEquals(cfg.port, 465);
  assertStrictEquals(cfg.secure, true);
  assertStrictEquals(cfg.user, "you@outlook.com");
  assertStrictEquals(cfg.pass, "sekret");
  assertStrictEquals(cfg.from, "you@outlook.com");
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
      location: "FAL",
      availability: "Indisponível",
      criticality: "Crítica",
      transitionDate: "2026-09-13",
      urgency: "critical",
    }],
    "2026-09-13T10:00:00Z",
  );
  assertStrictEquals(body.includes("[CRÍTICA] FAL-EQ-001 (FAL)"), true);
  assertStrictEquals(body.includes("desde 2026-09-13"), true);
  assertStrictEquals(body.includes("2026-09-13T10:00:00Z"), true);
});

Deno.test("urgentDigestBody appends detail lines and attribution when present", () => {
  const body = urgentDigestBody(
    [{
      tag: "FAL-EQ-001",
      location: "FAL",
      availability: "Indisponível",
      criticality: "Crítica",
      transitionDate: "2026-09-13",
      urgency: "critical",
      category: "Válvulas",
      author: "Eduardo",
      note: "vazamento observado",
      actionPlan: "trocar gaxeta",
    }],
    "2026-09-13T10:00:00Z",
  );
  assertStrictEquals(body.includes("categoria Válvulas"), true);
  assertStrictEquals(body.includes("Atualizado por: Eduardo"), true);
  assertStrictEquals(body.includes("Nota: vazamento observado"), true);
  assertStrictEquals(body.includes("Plano de ação: trocar gaxeta"), true);
});

Deno.test("urgentDigestHtml renders premium cards with attribution", () => {
  const html = urgentDigestHtml(
    [{
      tag: "FAL-EQ-001",
      location: "FAL",
      availability: "Indisponível",
      criticality: "Crítica",
      transitionDate: "2026-09-13",
      urgency: "critical",
      category: "Válvulas",
      typology: "On-Off",
      author: "Eduardo",
      note: "vazamento observado",
      actionPlan: "trocar gaxeta",
    }],
    "2026-09-13T10:00:00Z",
    "Seacrest Petróleo",
  );
  assertStrictEquals(html.includes("FAL-EQ-001"), true);
  assertStrictEquals(html.includes("CRÍTICA"), true);
  assertStrictEquals(html.includes("Seacrest Petróleo"), true);
  assertStrictEquals(html.includes("Atualizado por:"), true);
  assertStrictEquals(html.includes("Eduardo"), true);
  assertStrictEquals(html.includes("Plano de ação:"), true);
  assertStrictEquals(html.includes("multipart") === false, true);
});

Deno.test("urgentDigestHtml omits attribution when absent and escapes markup", () => {
  const html = urgentDigestHtml(
    [{
      tag: "<img src=x>",
      location: "FAL",
      availability: "Indisponível",
      criticality: "Crítica",
      transitionDate: "2026-09-13",
      urgency: "urgent",
    }],
    "2026-09-13T10:00:00Z",
  );
  assertStrictEquals(html.includes("<img src=x>"), false);
  assertStrictEquals(html.includes("&lt;img src=x&gt;"), true);
  assertStrictEquals(html.includes("Atualizado por:"), false);
  assertStrictEquals(html.includes("Monitor de Barreiras"), true);
});

Deno.test("escapeHtml quotes attribute-breaking characters", () => {
  assertStrictEquals(
    escapeHtml(`a&b<"c'>`),
    "a&amp;b&lt;&quot;c&#39;&gt;",
  );
});

Deno.test("smtpAlertMailer forwards the html part per recipient", async () => {
  const sent: Array<{ to: string; html?: string }> = [];
  const mailer = smtpAlertMailer(
    { hostname: "h", port: 25, from: "from@x", to: "" },
    async (config, _subject, _body, html) => {
      sent.push({ to: config.to, html });
      return await Promise.resolve();
    },
  );
  await mailer.send(["a@x"], "s", "b", "<p>rich</p>");
  assertStrictEquals(sent[0]?.html, "<p>rich</p>");
});
