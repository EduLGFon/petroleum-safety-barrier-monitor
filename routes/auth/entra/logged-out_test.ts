// Route tests for GET /auth/entra/logged-out - post-logout landing.
// This is why they exist: a cross-site GET must never revoke the server-side
// session (an embedded image or link could plant it), while a same-origin
// navigation revokes best-effort. The route is also hidden with 404 when SSO
// is disabled. DB-free via a globalThis.__barrierPool stub and Deno.env SSO
// settings; no Postgres is touched.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import type { Pool } from "@db/postgres";

// The route pulls Fresh, whose build-id module reads DENO_DEPLOYMENT_ID and
// its CI fallbacks while it evaluates, and the route reads its SSO settings
// through Deno.env. `deno task test` runs with a narrow --allow-env allowlist,
// so swap only the keys this suite owns for an in-memory overlay before
// loading the route. Every other key still goes to the real Deno.env and keeps
// its permission check, and the overlay also isolates the suite from the
// caller's shell environment.
const ENV_KEYS = new Set([
  "DENO_DEPLOYMENT_ID",
  "GITHUB_SHA",
  "CI_COMMIT_SHA",
  "AUTH_LOCAL_ENABLED",
  "AUTH_SSO_ENABLED",
  "AUTH_ENTRA_TENANT_ID",
  "AUTH_ENTRA_CLIENT_ID",
  "AUTH_ENTRA_CLIENT_SECRET",
  "AUTH_ENTRA_PRIVATE_KEY_PATH",
  "AUTH_ENTRA_CERTIFICATE_PATH",
  "AUTH_ENTRA_CLIENT_ASSERTION_ALG",
  "AUTH_SSO_FORCE_ACCOUNT_PICKER",
  "AUTH_SSO_FLOW_TTL_SECONDS",
  "AUTH_SSO_CLOCK_TOLERANCE_SECONDS",
  "AUTH_SSO_HTTP_TIMEOUT_MS",
  "AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED",
  "APP_BASE_URL",
]);
const envOverlay = new Map<string, string>();
const realEnvGet = Deno.env.get.bind(Deno.env);
const realEnvSet = Deno.env.set.bind(Deno.env);
const realEnvDelete = Deno.env.delete.bind(Deno.env);
Deno.env.get = (name: string): string | undefined =>
  ENV_KEYS.has(name) ? envOverlay.get(name) : realEnvGet(name);
Deno.env.set = (name: string, value: string): void => {
  if (ENV_KEYS.has(name)) envOverlay.set(name, value);
  else realEnvSet(name, value);
};
Deno.env.delete = (name: string): void => {
  if (ENV_KEYS.has(name)) {
    envOverlay.delete(name);
    return;
  }
  realEnvDelete(name);
};

// Loaded after the overlay is installed: a static import would be evaluated
// before this module body runs and hit the denied DENO_DEPLOYMENT_ID read.
const { handler } = await import("./logged-out.ts");

type GetCtx = Parameters<typeof handler.GET>[0];

interface LoggedOutStub {
  deletedTokenHashes: unknown[];
  restore: () => void;
}

function loggedOutCtx(req: Request): GetCtx {
  return { req } as unknown as GetCtx;
}

function loggedOutRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/auth/entra/logged-out", { headers });
}

function installLoggedOutStub(): LoggedOutStub {
  const prev = globalThis.__barrierPool;
  const deletedTokenHashes: unknown[] = [];
  const respond = (text: string, args: unknown[]): { rows: unknown[] } => {
    const lowered = text.trim().toLowerCase();
    if (lowered.startsWith("delete from sessions where token_hash")) {
      deletedTokenHashes.push(args[0]);
      return { rows: [] };
    }
    if (lowered.startsWith("select set_config")) return { rows: [] };
    return { rows: [] };
  };
  const stubClient = {
    queryObject: (
      text: string,
      args: unknown[] = [],
    ): Promise<{ rows: unknown[] }> => Promise.resolve(respond(text, args)),
    release: (): void => {},
  };
  const stubPool = {
    connect: (): Promise<typeof stubClient> => Promise.resolve(stubClient),
    end: async (): Promise<void> => {},
  };
  globalThis.__barrierPool = stubPool as unknown as Pool;
  return {
    deletedTokenHashes,
    restore: (): void => {
      globalThis.__barrierPool = prev;
    },
  };
}

function saveEnv(keys: string[]): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (const key of keys) {
    try {
      saved.set(key, Deno.env.get(key));
    } catch {
      saved.set(key, undefined);
    }
  }
  return saved;
}

function restoreEnv(saved: Map<string, string | undefined>): void {
  for (const [key, value] of saved) {
    try {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    } catch {
      // Best effort: test isolation must not fail on env permissions.
    }
  }
}

const SSO_KEYS = [
  "AUTH_SSO_ENABLED",
  "AUTH_ENTRA_TENANT_ID",
  "AUTH_ENTRA_CLIENT_ID",
  "AUTH_ENTRA_CLIENT_SECRET",
  "APP_BASE_URL",
];

function enableSso(): void {
  Deno.env.set("AUTH_SSO_ENABLED", "true");
  Deno.env.set(
    "AUTH_ENTRA_TENANT_ID",
    "11111111-1111-1111-1111-111111111111",
  );
  Deno.env.set(
    "AUTH_ENTRA_CLIENT_ID",
    "22222222-2222-2222-2222-222222222222",
  );
  Deno.env.set("AUTH_ENTRA_CLIENT_SECRET", "x".repeat(32));
  Deno.env.set("APP_BASE_URL", "http://localhost:8300");
}

function disableSso(): void {
  Deno.env.delete("AUTH_SSO_ENABLED");
  Deno.env.delete("AUTH_ENTRA_TENANT_ID");
  Deno.env.delete("AUTH_ENTRA_CLIENT_ID");
  Deno.env.delete("AUTH_ENTRA_CLIENT_SECRET");
  Deno.env.delete("APP_BASE_URL");
}

Deno.test("logged-out answers 404 when SSO is disabled", async () => {
  const saved = saveEnv(SSO_KEYS);
  const prevPool = globalThis.__barrierPool;
  globalThis.__barrierPool = prevPool;
  try {
    disableSso();
    const res = await handler.GET(
      loggedOutCtx(loggedOutRequest({})),
    );
    assertStrictEquals(res.status, 404);
  } finally {
    restoreEnv(saved);
    globalThis.__barrierPool = prevPool;
  }
});

Deno.test("logged-out cross-site keeps the server session but clears the cookie", async () => {
  const saved = saveEnv(SSO_KEYS);
  const stub = installLoggedOutStub();
  try {
    enableSso();
    const res = await handler.GET(
      loggedOutCtx(
        loggedOutRequest({
          cookie: "barrier_session=cross-site-token",
          "sec-fetch-site": "cross-site",
        }),
      ),
    );
    assertStrictEquals(res.status, 303);
    assertStrictEquals(res.headers.get("location"), "/login?sso=logout");
    const cleared = res.headers.get("set-cookie") ?? "";
    assert(cleared.includes("barrier_session="));
    assert(cleared.includes("Expires=Thu, 01 Jan 1970"));
    assertStrictEquals(stub.deletedTokenHashes.length, 0);
  } finally {
    stub.restore();
    restoreEnv(saved);
  }
});

Deno.test("logged-out same-origin revokes the server session row", async () => {
  const saved = saveEnv(SSO_KEYS);
  const stub = installLoggedOutStub();
  try {
    enableSso();
    const res = await handler.GET(
      loggedOutCtx(
        loggedOutRequest({
          cookie: "barrier_session=same-origin-token",
          "sec-fetch-site": "same-origin",
        }),
      ),
    );
    assertStrictEquals(res.status, 303);
    assertStrictEquals(res.headers.get("location"), "/login?sso=logout");
    const cleared = res.headers.get("set-cookie") ?? "";
    assert(cleared.includes("barrier_session="));
    assert(cleared.includes("Expires=Thu, 01 Jan 1970"));
    assertStrictEquals(stub.deletedTokenHashes.length, 1);
  } finally {
    stub.restore();
    restoreEnv(saved);
  }
});
