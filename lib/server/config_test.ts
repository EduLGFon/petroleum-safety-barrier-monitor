// Unit tests for server boot config (P4) - injected env getters, no
// Deno.env permission needed.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { loadServerConfig, loadSyncConfig } from "./config.ts";

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

Deno.test("loadSyncConfig requires the Fracttal credential pair", () => {
  let caught: Error | null = null;
  try {
    loadSyncConfig(env({ FRACTTAL_KEY: "k" }));
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(caught!.message.includes("FRACTTAL_KEY"), true);
});

Deno.test("loadSyncConfig prefers flag overrides over env", () => {
  const cfg = loadSyncConfig(
    env({
      FRACTTAL_KEY: "k",
      FRACTTAL_SECRET: "s",
      FRACTTAL_BASE_URL: "https://env.example",
      FRACTTAL_SYNC_ITEM_TYPE: "9",
    }),
    { baseUrl: "https://flag.example", itemType: 3 },
  );
  assertStrictEquals(cfg.baseUrl, "https://flag.example");
  assertStrictEquals(cfg.itemType, 3);
});

Deno.test("loadSyncConfig falls back to env then defaults", () => {
  const cfg = loadSyncConfig(env({ FRACTTAL_KEY: "k", FRACTTAL_SECRET: "s" }));
  assertStrictEquals(cfg.baseUrl, "https://app.fracttal.com/api");
  assertStrictEquals(cfg.itemType, 2);
});
