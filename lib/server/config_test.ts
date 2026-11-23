// Unit tests for server boot config (P4) - injected env getters, no
// Deno.env permission needed.
import {
  credentialFileModeError,
  isDevFracttalRawEnabled,
  loadAuthConfig,
  loadServerConfig,
  loadSyncConfig,
} from "./config.ts";

import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@^1";

function env(vars: Record<string, string>): (k: string) => string | undefined {
  return (k) => vars[k];
}

Deno.test("loadServerConfig requires DATABASE_URL in http mode", () => {
  let caught: Error | null = null;
  try {
    loadServerConfig(env({ PUBLIC_API_MODE: "http" }));
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(caught!.message.includes("DATABASE_URL"), true);
});

Deno.test("loadServerConfig passes with DATABASE_URL in http mode", () => {
  const cfg = loadServerConfig(
    env({ PUBLIC_API_MODE: "http", DATABASE_URL: "postgres://x" }),
  );
  assertStrictEquals(cfg.mode, "http");
  assertStrictEquals(cfg.databaseUrl, "postgres://x");
});

Deno.test("loadServerConfig defaults to mock and tolerates missing vars", () => {
  const cfg = loadServerConfig(env({}));
  assertStrictEquals(cfg.mode, "mock");
  assertStrictEquals(cfg.databaseUrl, undefined);
  assertStrictEquals(cfg.adminToken, undefined);
});

Deno.test("loadSyncConfig requires Fracttal credentials", () => {
  let caught: Error | null = null;
  try {
    loadSyncConfig(env({}));
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(
    caught!.message.includes("FRACTTAL_KEY/FRACTTAL_SECRET"),
    true,
  );
});

Deno.test("loadSyncConfig applies env and overrides", () => {
  const cfg = loadSyncConfig(
    env({ FRACTTAL_KEY: "k", FRACTTAL_SECRET: "s" }),
    { baseUrl: "https://app.fracttal.com/custom", itemType: 7 },
  );
  assertStrictEquals(cfg.key, "k");
  assertStrictEquals(cfg.secret, "s");
  assertStrictEquals(cfg.baseUrl, "https://app.fracttal.com/custom");
  assertStrictEquals(cfg.itemType, 7);
});

Deno.test("loadSyncConfig rejects non-allow-listed baseUrl hosts", () => {
  assertThrows(() =>
    loadSyncConfig(
      env({ FRACTTAL_KEY: "k", FRACTTAL_SECRET: "s" }),
      { baseUrl: "https://example.test", itemType: 7 },
    )
  );
  assertThrows(() =>
    loadSyncConfig(
      env({
        FRACTTAL_KEY: "k",
        FRACTTAL_SECRET: "s",
        FRACTTAL_BASE_URL: "https://evil.test/api",
      }),
    )
  );
});

Deno.test("isDevFracttalRawEnabled reads the flag case-insensitively", () => {
  assertStrictEquals(isDevFracttalRawEnabled(env({ DEV: "true" })), true);
  assertStrictEquals(isDevFracttalRawEnabled(env({ DEV: "1" })), false);
  assertStrictEquals(isDevFracttalRawEnabled(env({ DEV: "false" })), false);
  assertStrictEquals(isDevFracttalRawEnabled(env({})), false);
});

Deno.test("credentialFileModeError rejects group/other access on POSIX", () => {
  assertStrictEquals(credentialFileModeError(0o600, "linux"), null);
  assertStrictEquals(credentialFileModeError(0o400, "linux"), null);
  assertStrictEquals(credentialFileModeError(0o700, "linux"), null);
  assertEquals(
    credentialFileModeError(0o640, "linux"),
    "must not be accessible by group or other (chmod 600)",
  );
  assertEquals(
    credentialFileModeError(0o604, "linux"),
    "must not be accessible by group or other (chmod 600)",
  );
  assertEquals(
    credentialFileModeError(0o644, "linux"),
    "must not be accessible by group or other (chmod 600)",
  );
  // Windows has no POSIX mode bits; ACL validation is deployment's job.
  assertStrictEquals(credentialFileModeError(0o666, "windows"), null);
});

Deno.test("loadAuthConfig defaults to local login only", () => {
  const config = loadAuthConfig(() => undefined);
  assertEquals(config.localEnabled, true);
  assertEquals(config.ssoEnabled, false);
  assertEquals(config.entra, null);
});

Deno.test("loadAuthConfig rejects AUTH_LOCAL_ENABLED=false", () => {
  assertThrows(() =>
    loadAuthConfig((name) =>
      name === "AUTH_LOCAL_ENABLED" ? "false" : undefined
    )
  );
});

Deno.test("loadAuthConfig validates SSO settings", () => {
  assertThrows(() =>
    loadAuthConfig((name) => (name === "AUTH_SSO_ENABLED" ? "true" : undefined))
  );
});
