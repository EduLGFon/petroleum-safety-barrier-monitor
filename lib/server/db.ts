// Database pool - Deno-native Postgres connection pool (no ORM).
// This is why it exists: every query in lib/server/sql/*.ts goes through
// this one pool. Fresh route handlers are short-lived, so a small lazy pool
// is enough. Only server code may import this (never an island).
import { Pool } from "@db/postgres";

declare global {
  var __barrierPool: Pool | undefined;
}

// Creates lazy Postgres pool from DATABASE_URL; throws when unset.
// Loopback hosts (and explicit sslmode=disable) skip the TLS attempt
// outright: the driver tries TLS first for connection strings and prints a
// per-connection fallback warning when the server has no trusted cert,
// which buries real logs on local Postgres. Anything else keeps the
// default try-TLS-first behavior, so managed databases that require TLS
// keep working. The chosen mode is logged once here, not per connection.
function createPool(): Pool {
  const connectionString = Deno.env.get("DATABASE_URL");
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  const url = parseDatabaseUrl(connectionString);
  if (url !== null && !tlsAttemptNeeded(url)) {
    console.warn(
      `[db] TLS disabled for ${url.hostname} (loopback or sslmode=disable); using plaintext Postgres`,
    );
    return new Pool(
      {
        hostname: url.hostname,
        port: url.port === "" ? 5432 : Number(url.port),
        user: decodeUrlPart(url.username),
        password: decodeUrlPart(url.password),
        database: decodeUrlPart(url.pathname.replace(/^\//, "")),
        tls: { enabled: false },
      },
      10,
      true,
    );
  }
  // Lazy pool of 10: connections open on first use, reused across requests.
  return new Pool(connectionString, 10, true);
}

// parseDatabaseUrl: null when DATABASE_URL is not a parseable URL (the
// driver then owns the error); never throws out of pool creation.
function parseDatabaseUrl(connectionString: string): URL | null {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

// tlsAttemptNeeded: false for loopback hosts and explicit sslmode=disable
// (trusted local network, no cert to verify); true everywhere else so
// remote databases keep the driver's try-TLS-first handshake. Exported for
// unit tests; pool creation is the only caller.
export function tlsAttemptNeeded(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    host === "[::1]"
  ) {
    return false;
  }
  return !/(^|[?&])sslmode=disable($|&)/.test(url.search);
}

// decodeUrlPart: WHATWG URL keeps userinfo/path percent-encoded while the
// driver decodes connection strings itself; mirror that when building
// explicit client options. Falls back to the raw part on bad encoding.
function decodeUrlPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

// Lazily-created pool: first queryRows call initializes it, so importing
// this module (mock mode, health checks, tests) never throws for a missing
// DATABASE_URL. Cached on globalThis across dev reloads and requests.
function getPool(): Pool {
  if (!globalThis.__barrierPool) {
    globalThis.__barrierPool = createPool();
  }
  return globalThis.__barrierPool;
}

// Run a parameterized query and return typed rows. Values are always bound
// as $1/$2 args - never string-concatenate user input into `text`.
export async function queryRows<T>(
  text: string,
  args: Array<unknown> = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.queryObject<T>(text, args);
    return result.rows;
  } finally {
    client.release();
  }
}
