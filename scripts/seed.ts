// Seed - populates barriers + barrier_status_history with demo data.
// This is why it exists: reuses the deterministic mock generator so local
// Postgres matches mock mode. Run: deno task db:seed [-- --force]
import { Pool } from "@db/postgres";
import { getWireBarriers } from "../lib/data.ts";

const BATCH_SIZE = 500;

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env.local first.",
  );
  Deno.exit(1);
}

const force = Deno.args.includes("--force");
const pool = new Pool(connectionString, 1, true);

const BARRIER_COLS = [
  "tag",
  "tipologia_id",
  "location_id",
  "loc_desc_id",
  "criticidade_id",
  "categoria_id",
  "agrupamento_id",
  "dono_id",
  "disponibilidade_id",
  "comentarios",
  "plano_acao",
  "status_since",
] as const;

const HISTORY_COLS = [
  "barrier_id",
  "date",
  "status_id",
  "author_id",
  "note",
] as const;

type BarrierInsert = Record<(typeof BARRIER_COLS)[number], unknown>;
type HistoryInsert = Record<(typeof HISTORY_COLS)[number], unknown>;

// Builds a multi-row INSERT with numbered placeholders and flat args.
function buildInsert(
  table: string,
  cols: readonly string[],
  rows: Array<Record<string, unknown>>,
  returning = "",
): { text: string; args: unknown[] } {
  const args: unknown[] = [];
  const groups = rows.map((row) => {
    const marks = cols.map((col) => {
      args.push(row[col] ?? null);
      return `$${args.length}`;
    });
    return `(${marks.join(", ")})`;
  });
  const suffix = returning ? ` ${returning}` : "";
  return {
    text: `insert into ${table} (${cols.join(", ")}) values ${
      groups.join(", ")
    }${suffix}`,
    args,
  };
}

async function queryRows<T>(
  text: string,
  args: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.queryObject<T>(text, args);
    return result.rows;
  } finally {
    client.release();
  }
}

async function exec(text: string, args: unknown[] = []): Promise<void> {
  await queryRows(text, args);
}

async function main() {
  const countRows = await queryRows<{ count: string }>(
    "select count(*)::text as count from barriers",
  );
  const existing = Number(countRows[0]?.count ?? 0);

  if (existing > 0 && !force) {
    console.error(
      `barriers already has ${existing} rows. Re-run with --force to truncate and reseed.`,
    );
    Deno.exit(1);
  }

  if (existing > 0 && force) {
    console.log(
      `-> truncating barriers (${existing} rows) and barrier_status_history...`,
    );
    await exec(
      "truncate table barrier_status_history, barriers restart identity cascade",
    );
  }

  console.log("-> generating mock barrier set...");
  const barriers = getWireBarriers();
  console.log(`  generated ${barriers.length} barriers`);

  let inserted = 0;
  let historyInserted = 0;

  for (let i = 0; i < barriers.length; i += BATCH_SIZE) {
    const chunk = barriers.slice(i, i + BATCH_SIZE);

    const barrierRows: BarrierInsert[] = chunk.map((b) => ({
      tag: b.tag,
      tipologia_id: b.tipologiaId,
      location_id: b.locationId,
      loc_desc_id: b.locDescId,
      criticidade_id: b.criticidadeId,
      categoria_id: b.categoriaId,
      agrupamento_id: b.agrupamentoId,
      dono_id: b.donoId < 0 ? null : b.donoId,
      disponibilidade_id: b.disponibilidadeId,
      comentarios: b.comentarios,
      plano_acao: b.planoAcao,
      status_since: b.statusSince,
    }));

    // Postgres preserves input order for RETURNING on a single INSERT.
    const insert = buildInsert(
      "barriers",
      BARRIER_COLS,
      barrierRows,
      "returning id",
    );
    const returned = await queryRows<{ id: number }>(insert.text, insert.args);

    const historyRows: HistoryInsert[] = returned.flatMap((row, idx) =>
      chunk[idx].statusHistory.map((h) => ({
        barrier_id: row.id,
        date: h.date,
        status_id: h.statusId,
        author_id: h.authorId,
        note: h.note,
      }))
    );

    if (historyRows.length > 0) {
      const hist = buildInsert(
        "barrier_status_history",
        HISTORY_COLS,
        historyRows,
      );
      await exec(hist.text, hist.args);
      historyInserted += historyRows.length;
    }

    inserted += returned.length;
    console.log(`  inserted ${inserted}/${barriers.length} barriers...`);
  }

  console.log(
    `\nDone: ${inserted} barriers, ${historyInserted} history entries inserted.`,
  );
}

try {
  await main();
} catch (err) {
  console.error("\nSeed failed:", err);
  Deno.exit(1);
} finally {
  await pool.end();
}
