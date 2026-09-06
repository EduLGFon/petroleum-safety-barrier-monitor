/**
 * ══════════════════════════════════════════════════════════════════════════
 * SEED — populates barriers + barrier_status_history with demo data
 * ══════════════════════════════════════════════════════════════════════════
 * Reuses the exact same deterministic generator (lib/data.ts's
 * getWireBarriers) the app used for its in-memory mock adapter, so local
 * Postgres data matches what you'd see in "mock" mode: 6,800 barriers with
 * realistic distributions and status histories, resolvable back to display
 * strings via the same lib/enums.ts every other part of the app uses.
 *
 * Run with:
 *   deno task db:seed             # refuses if barriers already exist
 *   deno task db:seed -- --force  # wipes and reseeds
 *
 * Requires db/schema.sql and db/seed_lookups.sql to already be applied —
 * run scripts/migrate.ts first.
 */

import postgres from "npm:postgres@3.4.5";
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
const sql = postgres(connectionString, { max: 1 });

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

async function main() {
  const [{ count }] = await sql<
    { count: string }[]
  >`select count(*)::text as count from barriers`;
  const existing = Number(count);

  if (existing > 0 && !force) {
    console.error(
      `barriers already has ${existing} rows. Re-run with --force to truncate and reseed.`,
    );
    Deno.exit(1);
  }

  if (existing > 0 && force) {
    console.log(
      `→ truncating barriers (${existing} rows) and barrier_status_history…`,
    );
    await sql`truncate table barrier_status_history, barriers restart identity cascade`;
  }

  console.log("→ generating mock barrier set…");
  const barriers = getWireBarriers();
  console.log(`  generated ${barriers.length} barriers`);

  let inserted = 0;
  let historyInserted = 0;

  for (let i = 0; i < barriers.length; i += BATCH_SIZE) {
    const chunk = barriers.slice(i, i + BATCH_SIZE);

    const barrierRows = chunk.map((b) => ({
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

    // Multi-row insert; Postgres guarantees RETURNING preserves input order
    // for a single INSERT ... VALUES (...), (...) statement like this one.
    const returned = await sql<{ id: number }[]>`
      insert into barriers ${sql(barrierRows, ...BARRIER_COLS)}
      returning id
    `;

    const historyRows = returned.flatMap((row, idx) =>
      chunk[idx].statusHistory.map((h) => ({
        barrier_id: row.id,
        date: h.date,
        status_id: h.statusId,
        author_id: h.authorId,
        note: h.note,
      }))
    );

    if (historyRows.length > 0) {
      await sql`insert into barrier_status_history ${
        sql(historyRows, ...HISTORY_COLS)
      }`;
      historyInserted += historyRows.length;
    }

    inserted += returned.length;
    console.log(`  inserted ${inserted}/${barriers.length} barriers…`);
  }

  console.log(
    `\n✓ ${inserted} barriers, ${historyInserted} history entries inserted.`,
  );
}

try {
  await main();
} catch (err) {
  console.error("\nSeed failed:", err);
  Deno.exit(1);
} finally {
  await sql.end();
}
