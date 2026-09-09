// Database pool - Deno-native Postgres connection pool (no ORM).
// This is why it exists: every query in lib/server/sql/*.ts goes through
// this one pool. Fresh route handlers are short-lived, so a small lazy pool
// is enough. Only server code may import this (never an island).
import { Pool } from "@db/postgres";

declare global {
  var __barrierPool: Pool | undefined;
}

// Creates lazy Postgres pool from DATABASE_URL; throws when unset.
function createPool(): Pool {
  const connectionString = Deno.env.get("DATABASE_URL");
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.",
    );
  }
  // Lazy pool of 10: connections open on first use, reused across requests.
  return new Pool(connectionString, 10, true);
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
