import "server-only";
import postgres from "postgres";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATABASE CLIENT — postgres.js singleton (raw SQL, no ORM)
 * ══════════════════════════════════════════════════════════════════════════
 * Every query in lib/server/sql/*.ts goes through this one connection pool.
 * Queries are written as tagged-template SQL (sql`select ... where id = ${id}`),
 * which postgres.js parameterizes automatically — never string-concatenate
 * user input into a query string.
 *
 * The `server-only` import ensures this file (and anything importing it)
 * throws a build-time error if accidentally pulled into a client component
 * bundle — the connection string and pool must never reach the browser.
 */

declare global {
  // eslint-disable-next-line no-var
  var __seacrestSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.",
    );
  }
  return postgres(connectionString, {
    // Modest pool for a single Next.js server process. Route handlers are
    // short-lived requests, not long connections, so this rarely needs to
    // grow — raise it if you see "sorry, too many clients already" under load.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null }, // let JS `undefined` map to SQL NULL
  });
}

// Reuse the pool across hot reloads in dev (each `next dev` recompile would
// otherwise open a fresh pool and leak connections) and across route handler
// invocations in prod (Next.js can reuse the same Node process/module cache).
export const sql = globalThis.__seacrestSql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__seacrestSql = sql;
}
