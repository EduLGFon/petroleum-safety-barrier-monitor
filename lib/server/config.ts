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

export type AuthSource = "local" | "entra";

export type EntraCredential =
  | {
    type: "key";
    privateKeyPath: string;
    certificatePath: string;
  }
  | { type: "secret"; secret: string };

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  credential: EntraCredential;
  // clientAssertionAlg: JWS alg for the private_key_jwt client assertion.
  // Entra requires RS256 (RSASSA-PKCS1-v1_5); PS256 stays accepted only as an
  // explicit override for non-Entra issuers in development.
  clientAssertionAlg: string;
  forceAccountPicker: boolean;
  flowTtlSeconds: number;
  clockToleranceSeconds: number;
  httpTimeoutMs: number;
  appBaseUrl: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  frontChannelLogoutEnabled: boolean;
}

export interface AuthConfig {
  localEnabled: boolean;
  ssoEnabled: boolean;
  entra: EntraConfig | null;
}

// isProductionEnv: explicit deployment marker, deliberately separate from
// NODE_ENV (Vite sets NODE_ENV=production during a build and a strict check
// must not run in that phase). Containers set DENO_ENV=production; native
// installs set APP_ENV=production.
export function isProductionEnv(get: EnvGetter = defaultEnv): boolean {
  const raw = (get("DENO_ENV") ?? get("APP_ENV") ?? "").trim().toLowerCase();
  return raw === "production" || raw === "prod";
}

// parseApiMode: unknown values are a typo, never an implicit mock. Mock is
// the documented development default when the variable is absent.
export function parseApiMode(raw: string | undefined): ApiMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "mock") return "mock";
  if (value === "http") return "http";
  throw new Error(
    `PUBLIC_API_MODE must be "mock" or "http" (got "${raw}")`,
  );
}

// loadServerConfig: validates boot configuration. DATABASE_URL is required
// in http mode (routes query Postgres directly); ADMIN_TOKEN stays optional
// here because auth.ts fail-closes writes when it is unset. Production may
// not run in mock mode: generated demo data must never look live.
export function loadServerConfig(get: EnvGetter = defaultEnv): ServerConfig {
  const mode = parseApiMode(get("PUBLIC_API_MODE"));
  const databaseUrl = get("DATABASE_URL");
  if (mode === "http" && !databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set (required with PUBLIC_API_MODE=http). " +
        "Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  if (isProductionEnv(get) && mode !== "http") {
    throw new Error(
      "PUBLIC_API_MODE must be http in production; refusing to serve mock data",
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
  const baseUrl = overrides.baseUrl ??
    get("FRACTTAL_BASE_URL") ??
    "https://app.fracttal.com/api";
  return {
    key,
    secret,
    baseUrl: assertFracttalBaseUrl(baseUrl),
    itemType: overrides.itemType ??
      (Number(get("FRACTTAL_SYNC_ITEM_TYPE")) || 2),
  };
}

// Fracttal network boundary: the only upstream host ever contacted is the
// prod API. A --base-url / FRACTTAL_BASE_URL pointing elsewhere (typo,
// SSRF probe, staging leak) must fail closed here, not on first fetch.
export const ALLOWED_FRACTTAL_HOSTS = ["app.fracttal.com"] as const;

export function assertFracttalBaseUrl(raw: string): string {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`FRACTTAL_BASE_URL is not a valid URL: ${raw}`);
  }
  if (!(ALLOWED_FRACTTAL_HOSTS as readonly string[]).includes(host)) {
    throw new Error(
      `FRACTTAL_BASE_URL host "${host}" not allow-listed (allowed: ${
        ALLOWED_FRACTTAL_HOSTS.join(", ")
      })`,
    );
  }
  return raw;
}

// Fixture boundary: --fixture/--output/--work-fixture must stay inside
// scripts/fixtures/*.json so a CLI flag can never overwrite arbitrary
// files (path traversal) or exfiltrate outside the reviewed fixture dir.
export function assertFixturePath(raw: string, flag = "--fixture"): string {
  if (raw.includes("\0")) throw new Error(`${flag} contains NUL`);
  const norm = raw.replace(/\\/g, "/");
  if (norm.includes("..")) {
    throw new Error(`${flag} must not contain ".." (got ${raw})`);
  }
  if (!norm.endsWith(".json")) {
    throw new Error(`${flag} must end in .json (got ${raw})`);
  }
  // Allowed forms: scripts/fixtures/<name>.json (repo-relative) or an
  // absolute path that ends with scripts/fixtures/<name>.json.
  const idx = norm.indexOf("scripts/fixtures/");
  if (idx < 0) {
    throw new Error(
      `${flag} must be inside scripts/fixtures/*.json (got ${raw})`,
    );
  }
  const rest = norm.slice(idx + "scripts/fixtures/".length);
  if (rest === "" || rest.includes("/")) {
    throw new Error(
      `${flag} must be a direct child of scripts/fixtures/*.json (got ${raw})`,
    );
  }
  return raw;
}

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBoolFlag(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function clampNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function normalizeGuid(name: string, raw: string | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (!GUID_RE.test(value)) throw new Error(`${name} must be a GUID`);
  return value;
}

function normalizePath(name: string, raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value === "") throw new Error(`${name} is required`);
  if (value.includes("\u0000") || value.length > 1024) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function normalizeClientAssertionAlg(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") return "RS256";
  const value = raw.trim().toUpperCase();
  if (value !== "RS256" && value !== "PS256") {
    throw new Error("AUTH_ENTRA_CLIENT_ASSERTION_ALG must be RS256 or PS256");
  }
  return value;
}

function assertCredentialFilesReadable(credential: EntraCredential): void {
  if (credential.type !== "key") return;
  // Fail fast at boot: an unreadable key/cert path must surface here, not as
  // a private_key_jwt failure on the first login attempt. The doctor sso-key
  // check re-validates the material itself at runtime.
  const paths = [
    ["AUTH_ENTRA_PRIVATE_KEY_PATH", credential.privateKeyPath],
    ["AUTH_ENTRA_CERTIFICATE_PATH", credential.certificatePath],
  ] as const;
  for (const [name, path] of paths) {
    let stat: Deno.FileInfo;
    try {
      stat = Deno.statSync(path);
    } catch {
      throw new Error(`${name} is not readable: ${path}`);
    }
    if (!stat.isFile) throw new Error(`${name} is not a file: ${path}`);
  }
}

function normalizeAppBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value === "") {
    throw new Error("APP_BASE_URL is required when SSO is enabled");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_BASE_URL must be a valid URL");
  }
  if (
    url.username !== "" || url.password !== "" || url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "APP_BASE_URL must not contain credentials, query, or hash",
    );
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("APP_BASE_URL must not contain a path");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("APP_BASE_URL must use http or https");
  }
  if (
    url.protocol === "http:" && url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("APP_BASE_URL must use https outside local development");
  }
  return `${url.protocol}//${url.host}`;
}

// loadAuthConfig: SSO and local-login configuration. SSO stays disabled by
// default, so an unchanged deployment keeps working. Key/cert file contents
// are read lazily by the Entra client, but their paths are stat-checked here
// so a typo fails fast at boot instead of on the first login attempt.
export function loadAuthConfig(get: EnvGetter = defaultEnv): AuthConfig {
  const localEnabled = parseBoolFlag(
    "AUTH_LOCAL_ENABLED",
    get("AUTH_LOCAL_ENABLED"),
    true,
  );
  if (!localEnabled) {
    throw new Error(
      "AUTH_LOCAL_ENABLED=false is not supported in this release; local login is the break-glass path",
    );
  }
  const ssoEnabled = parseBoolFlag(
    "AUTH_SSO_ENABLED",
    get("AUTH_SSO_ENABLED"),
    false,
  );
  if (!ssoEnabled) {
    return { localEnabled, ssoEnabled: false, entra: null };
  }
  const tenantId = normalizeGuid(
    "AUTH_ENTRA_TENANT_ID",
    get("AUTH_ENTRA_TENANT_ID"),
  );
  const clientId = normalizeGuid(
    "AUTH_ENTRA_CLIENT_ID",
    get("AUTH_ENTRA_CLIENT_ID"),
  );
  const secretRaw = get("AUTH_ENTRA_CLIENT_SECRET")?.trim();
  const keyPathRaw = get("AUTH_ENTRA_PRIVATE_KEY_PATH")?.trim();
  const certPathRaw = get("AUTH_ENTRA_CERTIFICATE_PATH")?.trim();
  const hasSecret = typeof secretRaw === "string" && secretRaw !== "";
  const hasKey = typeof keyPathRaw === "string" && keyPathRaw !== "";
  const hasCert = typeof certPathRaw === "string" && certPathRaw !== "";
  if (hasSecret && (hasKey || hasCert)) {
    throw new Error(
      "configure either AUTH_ENTRA_CLIENT_SECRET or the key and certificate, not both",
    );
  }
  if (hasKey !== hasCert) {
    throw new Error(
      "AUTH_ENTRA_PRIVATE_KEY_PATH and AUTH_ENTRA_CERTIFICATE_PATH must both be set",
    );
  }
  if (!hasSecret && !hasKey) {
    throw new Error(
      "configure AUTH_ENTRA_CLIENT_SECRET or AUTH_ENTRA_PRIVATE_KEY_PATH plus AUTH_ENTRA_CERTIFICATE_PATH",
    );
  }
  let credential: EntraCredential;
  if (hasSecret) {
    if (secretRaw!.length < 32) {
      throw new Error("AUTH_ENTRA_CLIENT_SECRET is too short");
    }
    credential = { type: "secret", secret: secretRaw! };
  } else {
    credential = {
      type: "key",
      privateKeyPath: normalizePath("AUTH_ENTRA_PRIVATE_KEY_PATH", keyPathRaw),
      certificatePath: normalizePath(
        "AUTH_ENTRA_CERTIFICATE_PATH",
        certPathRaw,
      ),
    };
  }
  assertCredentialFilesReadable(credential);
  const appBaseUrl = normalizeAppBaseUrl(get("APP_BASE_URL"));
  const redirectUri = `${appBaseUrl}/auth/entra/callback`;
  const postLogoutRedirectUri = `${appBaseUrl}/auth/entra/logged-out`;
  return {
    localEnabled,
    ssoEnabled: true,
    entra: {
      tenantId,
      clientId,
      credential,
      clientAssertionAlg: normalizeClientAssertionAlg(
        get("AUTH_ENTRA_CLIENT_ASSERTION_ALG"),
      ),
      forceAccountPicker: parseBoolFlag(
        "AUTH_SSO_FORCE_ACCOUNT_PICKER",
        get("AUTH_SSO_FORCE_ACCOUNT_PICKER"),
        true,
      ),
      flowTtlSeconds: clampNumber(
        "AUTH_SSO_FLOW_TTL_SECONDS",
        get("AUTH_SSO_FLOW_TTL_SECONDS"),
        600,
        120,
        900,
      ),
      clockToleranceSeconds: clampNumber(
        "AUTH_SSO_CLOCK_TOLERANCE_SECONDS",
        get("AUTH_SSO_CLOCK_TOLERANCE_SECONDS"),
        60,
        0,
        300,
      ),
      httpTimeoutMs: clampNumber(
        "AUTH_SSO_HTTP_TIMEOUT_MS",
        get("AUTH_SSO_HTTP_TIMEOUT_MS"),
        10000,
        1000,
        30000,
      ),
      appBaseUrl,
      redirectUri,
      postLogoutRedirectUri,
      frontChannelLogoutEnabled: parseBoolFlag(
        "AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED",
        get("AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED"),
        false,
      ),
    },
  };
}

// isDevFracttalRawEnabled: exact opt-in for the sensitive, read-only raw
// Fracttal detail endpoint. Environment access failure keeps it disabled.
export function isDevFracttalRawEnabled(
  get: EnvGetter = defaultEnv,
): boolean {
  try {
    return get("DEV") === "true";
  } catch {
    return false;
  }
}
