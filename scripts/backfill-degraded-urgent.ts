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
// The apply loop is one transaction: either every row is demoted and the
// audit row is written, or nothing is. A per-row COMMIT would leave a
// half-demoted dataset and a misleading audit trail when a later row fails.
//
// Run (dry report first):
//   deno run -A --env-file=.env scripts/backfill-degraded-urgent.ts
// Apply:
//   ... same command with --apply
import { Pool } from "@db/postgres";

const SYNC_AUTHOR_ID = 10;

const NOTE =
  "Regra atualizada: Degradada exige gatilho urgente (is_urgent); sem evidência de urgência, retorna a Disponível";

// Same transaction demotes the status (sanctioned path) and clears the
// urgent-gated sheet fields so a demoted row does not keep a stale Degradada
// description/action/failure flag.
const DEMOTE_FIELDS_SQL =
  `update barriers set degradation_desc = '', action_plan = '', failure_free = 'Sim', op_status = 'Disponível', maint_status = 'Disponível', field_operational = 'Sim', has_contingency = 'Não', contingency_desc = null, evidence_code = null where id = $1`;

export interface DegradedBarrierRow {
  id: number;
  external_code: string;
  availability_id: number;
  latest_author: number | null;
}

// Minimal client surface the apply loop needs. Structural typing lets main()
// pass the real PoolClient and tests pass a fake that records statements.
export interface BackfillClient {
  queryArray(text: string, args?: unknown[]): Promise<unknown>;
}

// applyDemotions: the whole apply loop under one BEGIN/COMMIT. The sync_state
// audit row is inserted inside the same transaction after every row has been
// processed, so a rollback leaves neither partial demotions nor a success
// marker. Returns the number of rows demoted.
export async function applyDemotions(
  client: BackfillClient,
  rows: readonly DegradedBarrierRow[],
): Promise<number> {
  await client.queryArray("BEGIN", []);
  try {
    let demoted = 0;
    for (const row of rows) {
      await client.queryArray(
        "select record_status_change($1, $2, $3, $4)",
        [row.id, 0, SYNC_AUTHOR_ID, NOTE],
      );
      await client.queryArray(DEMOTE_FIELDS_SQL, [row.id]);
      demoted++;
      if (demoted % 500 === 0) console.log(`  processed ${demoted}...`);
    }
    await client.queryArray(
      `insert into sync_state (scope, status, inserts, note) values ('backfill-degraded-urgent', 'ok', 0, $1)`,
      [`demoted ${demoted} degraded rows without urgent trigger to Disponivel`],
    );
    await client.queryArray("COMMIT", []);
    return demoted;
  } catch (err) {
    try {
      await client.queryArray("ROLLBACK", []);
    } catch {
      // Already closed; the original error is the one that matters.
    }
    throw err;
  }
}

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
    const rows = await client.queryObject<DegradedBarrierRow>(
      `select b.id, b.external_code, b.availability_id,
        (select h.author_id from barrier_status_history h
          where h.barrier_id = b.id order by h.created_at desc, h.id desc limit 1) as latest_author
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

    const demoted = await applyDemotions(client, syncOwned);
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
