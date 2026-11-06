// Unit tests for account notices - payload shape, channel rules, and the
// fail-soft error path that must never echo the password.
import {
  buildAccountNoticeBody,
  type FetchImpl,
  sendAccountNotice,
} from "./account-notice.ts";

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { ProviderConfig } from "./provider.ts";

const CONFIG: ProviderConfig = {
  baseUrl: "https://provider.example.com",
  token: "test-token",
  companyId: 1,
};

const PASSWORD = "Tmp3-Password-Xy";

const INPUT = {
  accountId: 42,
  kind: "senha_criada" as const,
  password: PASSWORD,
  name: "Ana Teste",
  login: " Ana@Example.com ",
};

async function withProviderEnv(fn: () => Promise<void>): Promise<void> {
  const keys = [
    "ALERT_PROVIDER_BASE_URL",
    "ALERT_PROVIDER_TOKEN",
    "ALERT_PROVIDER_COMPANY_ID",
  ];
  const previous = keys.map((key) => Deno.env.get(key));
  Deno.env.set("ALERT_PROVIDER_BASE_URL", "https://provider.example.com");
  Deno.env.set("ALERT_PROVIDER_TOKEN", "test-token");
  Deno.env.set("ALERT_PROVIDER_COMPANY_ID", "1");
  try {
    await fn();
  } finally {
    for (let i = 0; i < keys.length; i++) {
      const value = previous[i];
      if (value === undefined) Deno.env.delete(keys[i]);
      else Deno.env.set(keys[i], value);
    }
  }
}

Deno.test("account notice body keeps one destination per channel", () => {
  const body = buildAccountNoticeBody(INPUT, CONFIG);
  assertStrictEquals(body.conta_id, "42");
  assertStrictEquals(body.tipo, "senha_criada");
  assertEquals(body.canais, ["email"]);
  assertEquals(body.destinatarios, [
    { canal: "email", valor: "ana@example.com", nome: "Ana Teste" },
  ]);
  assertStrictEquals(body.senha, PASSWORD);
  assert(!("validade_horas" in body));
  assert(!("link_login" in body));
});

Deno.test("account notice adds whatsapp only for a usable phone", () => {
  const withPhone = buildAccountNoticeBody(
    { ...INPUT, phone: "(27) 99999-9999" },
    CONFIG,
  );
  assertEquals(withPhone.canais, ["email", "whatsapp"]);
  const destinations = withPhone.destinatarios as Array<
    Record<string, string>
  >;
  assertStrictEquals(destinations.length, 2);
  assertStrictEquals(destinations[1].valor, "27999999999");

  const shortPhone = buildAccountNoticeBody(
    { ...INPUT, phone: "123" },
    CONFIG,
  );
  assertEquals(shortPhone.canais, ["email"]);
});

Deno.test("invite carries no password and keeps its idempotency mark", () => {
  const mark = "2026-11-06T12:00:00.000Z";
  const body = buildAccountNoticeBody({
    accountId: 7,
    kind: "convite",
    password: PASSWORD,
    name: "Ana Teste",
    login: "ana@example.com",
    occurredAt: mark,
  }, CONFIG);
  assert(!("senha" in body));
  assertStrictEquals(body.ocorrido_em, mark);
  assert(!("validade_horas" in body));
});

Deno.test("notice posts once and reports success", async () => {
  await withProviderEnv(async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const stub: FetchImpl = (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.sent, true);
    assertStrictEquals(calls.length, 1);
    assert(calls[0].url.endsWith("/internal/api/monitor/conta"));
    const headers = calls[0].init.headers as Record<string, string>;
    assertStrictEquals(headers["X-MSGFLOW-TOKEN"], "test-token");
    const payload = JSON.parse(String(calls[0].init.body));
    assertStrictEquals(payload.senha, PASSWORD);
  });
});

Deno.test("dry run hits the test path and sends nothing", async () => {
  await withProviderEnv(async () => {
    const urls: string[] = [];
    const stub: FetchImpl = (input) => {
      urls.push(String(input));
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
    await sendAccountNotice({ ...INPUT, dryRun: true }, stub);
    assert(urls[0].endsWith("/internal/api/monitor/conta/teste"));
  });
});

Deno.test("provider error keeps only the envelope message", async () => {
  await withProviderEnv(async () => {
    const stub: FetchImpl = () =>
      Promise.resolve(
        Response.json(
          { erro: "campo obrigatorio", campo: "telefone" },
          { status: 422 },
        ),
      );
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.sent, false);
    assertStrictEquals(result.status, 422);
    assertStrictEquals(result.reason, "HTTP 422: campo obrigatorio");
    assert(!String(result.reason).includes(PASSWORD));
  });
});

Deno.test("provider reason is replaced when it could echo the password", async () => {
  await withProviderEnv(async () => {
    const stub: FetchImpl = () =>
      Promise.resolve(
        Response.json(
          { mensagem: `senha invalida: ${PASSWORD}` },
          { status: 422 },
        ),
      );
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.reason, "HTTP 422");
    assert(!String(result.reason).includes(PASSWORD));
  });
});

Deno.test("raw body echo forces the status-only reason", async () => {
  await withProviderEnv(async () => {
    const stub: FetchImpl = () =>
      Promise.resolve(
        Response.json(
          { erro: "campo obrigatorio", senha: PASSWORD },
          { status: 422 },
        ),
      );
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.reason, "HTTP 422");
    assert(!String(result.reason).includes(PASSWORD));
  });
});

Deno.test("truncation boundary cannot leak a password prefix", async () => {
  await withProviderEnv(async () => {
    // The password begins just before the 200-char cut, so slicing first
    // would return its first characters.
    const prefix = "x".repeat(195);
    const stub: FetchImpl = () =>
      Promise.resolve(
        Response.json(
          { mensagem: `${prefix}${PASSWORD}` },
          { status: 422 },
        ),
      );
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.reason, "HTTP 422");
    assert(!String(result.reason).includes(PASSWORD.slice(0, 5)));
    assert(!String(result.reason).includes(PASSWORD));
  });
});

Deno.test("non-JSON provider error never leaks the body", async () => {
  await withProviderEnv(async () => {
    const stub: FetchImpl = () =>
      Promise.resolve(new Response(`senha=${PASSWORD}`, { status: 500 }));
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.reason, "HTTP 500");
    assert(!String(result.reason).includes(PASSWORD));
  });
});

Deno.test("unreachable provider fails soft", async () => {
  await withProviderEnv(async () => {
    const stub: FetchImpl = () => Promise.reject(new Error("network down"));
    const result = await sendAccountNotice(INPUT, stub);
    assertStrictEquals(result.sent, false);
    assertStrictEquals(result.reason, "network down");
  });
});

Deno.test("missing provider config fails soft without throwing", async () => {
  await withProviderEnv(async () => {
    Deno.env.set("ALERT_PROVIDER_TOKEN", "");
    const result = await sendAccountNotice(
      INPUT,
      () => Promise.resolve(new Response("{}", { status: 200 })),
    );
    assertStrictEquals(result.sent, false);
    assert(result.reason !== undefined);
  });
});
