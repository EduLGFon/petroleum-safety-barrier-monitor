/**
 * ══════════════════════════════════════════════════════════════════════════
 * MIGRATE — applies db/schema.sql then db/seed_lookups.sql
 * ══════════════════════════════════════════════════════════════════════════
 * Run with:
 *   deno task db:migrate
 *
 * Safe to re-run: schema.sql uses `create table if not exists` / `create or
 * replace function`, and seed_lookups.sql uses `on conflict ... do update`,
 * so this is idempotent against an already-migrated database.
 */

import postgres from 'npm:postgres@3.4.5';
import { fileURLToPath } from 'node:url';

const connectionString = Deno.env.get('DATABASE_URL');
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  Deno.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function applyFile(path: string) {
  console.log(`→ applying ${path}`);
  await sql.file(path);
  console.log(`✓ ${path} applied`);
}

try {
  await applyFile(fileURLToPath(new URL('../db/schema.sql', import.meta.url)));
  await applyFile(fileURLToPath(new URL('../db/seed_lookups.sql', import.meta.url)));
  console.log('\nMigration complete.');
} catch (err) {
  console.error('\nMigration failed:', err);
  Deno.exit(1);
} finally {
  await sql.end();
}
