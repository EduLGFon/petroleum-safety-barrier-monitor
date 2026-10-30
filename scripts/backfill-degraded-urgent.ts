// Backfill for the urgent-gated degraded rule.
// Degradada (4) and Degradado Contingenciado (3) are now only assigned when
// the triggering planned event carries the urgent flag (StatusEvent.isUrgent,
// from WR is_urgent). Rows stored under the old rule (any open planned
// corrective -> degraded) must be demoted to Disponivel (0) unless a future
// sync re-promotes them from an urgent trigger.
//
// Why a blanket demotion: barriers do not store the trigger's is_urgent flag,
// so SQL cannot tell which degraded rows were urgent. Demoting all sync-owned
// 3/4 rows is the safe fail-open step; the next sync/import recomputes from
// live work events and re-promotes the truly urgent ones.
//
// Admin overrides are respected: rows whose latest history author is not the
// sync author (id 10) are skipped, exactly like the sync planner.
//
// Run (dry report first):
//   deno run -A --env-file=.env scripts/backfill-degraded-urgent.ts
// Apply:
//   ... same command with --apply
import { Pool } from "@db/postgres";

const SYNC_AUTHOR_ID = 10;

const NOTE =
  "Regra atualizada: Degradada exige gatilho urgente (is_urgent); sem evidência de urgência, retorna a Disponível";

async function main(): Promise<void> {
  const apply = new Set(Deno.args).has("--apply");
  const connectionString = Deno.env.get("DATABASE_URL");
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    Deno.exit(1);
  }
  const pool = new Pool(connectionString, 1, true);
  const client = await pool.connect();
  try {
    const rows = await client.queryObject<{
      id: number;
      external_code: string;
      availability_id: number;
      latest_author: number | null;
    }>(
      `select b.id, b.external_code, b.availability_id,
        (select h.author_id from barrier_status_history h
          where h.barrier_id = b.id order by h.id desc limit 1) as latest_author
       from barriers b
       where b.availability_id in (3, 4) and b.deleted_at is null
       order by b.id`,
    ).then((r) => r.rows);

    const syncOwned = rows.filter((r) =>
      r.latest_author === null || r.latest_author === SYNC_AUTHOR_ID
    );
    const adminOwned = rows.filter((r) =>
      r.latest_author !== null && r.latest_author !== SYNC_AUTHOR_ID
    );

    console.log(
      `Degraded rows: ${rows.length} ` +
        `(${syncOwned.length} sync-owned to demote, ${adminOwned.length} admin-owned skipped)`,
    );
    for (const r of syncOwned.slice(0, 20)) {
      console.log(
        `  ${r.external_code} id=${r.id} status=${r.availability_id} -> 0`,
      );
    }
    if (syncOwned.length > 20) {
      console.log(`  ... and ${syncOwned.length - 20} more`);
    }
    for (const r of adminOwned.slice(0, 20)) {
      console.log(
        `  skip admin-owned ${r.external_code} id=${r.id} author=${r.latest_author}`,
      );
    }

    if (!apply) {
      console.log(
        `\nDry run. Re-run with --apply to demote via record_status_change().`,
      );
      return;
    }

    let demoted = 0;
    for (const r of syncOwned) {
      await client.queryArray(
        "select record_status_change($1, $2, $3, $4)",
        [r.id, 0, SYNC_AUTHOR_ID, NOTE],
      );
      demoted++;
      if (demoted % 500 === 0) console.log(`  demoted ${demoted}...`);
    }
    await client.queryArray(
      `insert into sync_state (scope, status, inserts, note) values ('backfill-degraded-urgent', 'ok', 0, $1)`,
      [`demoted ${demoted} degraded rows without urgent trigger to Disponivel`],
    );
    console.log(`\nDone: demoted ${demoted} rows to Disponivel (0).`);
    console.log(
      `Next sync/import re-promotes rows whose open planned trigger carries is_urgent=true.`,
    );
  } finally {
    try {
      client.release();
    } catch {
      // pool already closed
    }
    await pool.end();
  }
}

if (import.meta.main) {
  await main();
}
