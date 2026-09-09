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

// Reuse the pool across dev reloads and across route invocations.
export const pool: Pool = globalThis.__barrierPool ?? createPool();

const denoEnv = Deno.env.get("DENO_ENV") ?? Deno.env.get("NODE_ENV");
if (denoEnv !== "production") {
  globalThis.__barrierPool = pool;
}

// Run a parameterized query and return typed rows. Values are always bound
// as $1/$2 args - never string-concatenate user input into `text`.
export async function queryRows<T>(
  text: string,
  args: Array<unknown> = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<T>(text, args);
    return result.rows;
  } finally {
    client.release();
  }
}
