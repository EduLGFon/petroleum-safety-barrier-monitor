// Server boot config - fail fast on missing env, single-sourced.
// This is why it exists: a missing DATABASE_URL used to surface as a pool
// error deep in a request; now the first touch of the server config names
// the exact variable and where to set it. Sync scripts share the Fracttal
// half so their credential checks cannot drift from the docs.
export type ApiMode = "mock" | "http";

export interface ServerConfig {
  mode: ApiMode;
  databaseUrl: string | undefined;
  adminToken: string | undefined;
}

export interface SyncConfig {
  key: string;
  secret: string;
  baseUrl: string;
  itemType: number;
}

export type EnvGetter = (name: string) => string | undefined;

const defaultEnv: EnvGetter = (name) => Deno.env.get(name);

// loadServerConfig: validates http-mode boot. DATABASE_URL is required in
// http mode (the routes query Postgres directly); ADMIN_TOKEN stays optional
// here because auth.ts fail-closes writes when it is unset.
export function loadServerConfig(get: EnvGetter = defaultEnv): ServerConfig {
  const mode = get("PUBLIC_API_MODE") === "http" ? "http" : "mock";
  const databaseUrl = get("DATABASE_URL");
  if (mode === "http" && !databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set (required with PUBLIC_API_MODE=http). " +
        "Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  return { mode, databaseUrl, adminToken: get("ADMIN_TOKEN") };
}

// loadSyncConfig: validates Fracttal credentials for the sync scripts.
// Flag overrides (baseUrl/itemType) win over env so --live runs keep their
// CLI behavior; missing credentials throw the same message the scripts
// always printed.
export function loadSyncConfig(
  get: EnvGetter = defaultEnv,
  overrides: { baseUrl?: string; itemType?: number } = {},
): SyncConfig {
  const key = get("FRACTTAL_KEY");
  const secret = get("FRACTTAL_SECRET");
  if (!key || !secret) {
    throw new Error(
      "FRACTTAL_KEY/FRACTTAL_SECRET required (prod tenant, reviewed; never committed)",
    );
  }
  return {
    key,
    secret,
    baseUrl: overrides.baseUrl ??
      get("FRACTTAL_BASE_URL") ??
      "https://app.fracttal.com/api",
    itemType: overrides.itemType ??
      (Number(get("FRACTTAL_SYNC_ITEM_TYPE")) || 2),
  };
}
