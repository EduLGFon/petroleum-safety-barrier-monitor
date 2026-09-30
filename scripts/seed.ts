// Seed - populates barriers + barrier_status_history with demo data.
// This is why it exists: reuses the deterministic mock generator so local
// Postgres matches mock mode. Run: deno task db:seed [-- --force]
import { LOCATION_DIST_BY_ID, LOCATIONS } from "../lib/constants.ts";

import { CATEGORY_CODES } from "../lib/enums.ts";

import { getWireBarriers } from "../lib/data.ts";

import { Pool } from "@db/postgres";

const BATCH_SIZE = 500;

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env first.",
  );
  Deno.exit(1);
}

const force = Deno.args.includes("--force");
const pool = new Pool(connectionString, 1, true);

const BARRIER_COLS = [
  "tag",
  "typology_id",
  "location_id",
  "loc_desc_id",
  "criticality_id",
  "category_id",
  "grouping_id",
  "owner_id",
  "availability_id",
  "comments",
  "action_plan",
  "status_since",
  "external_code",
  "is_active",
  "deleted_at",
  "origin",
  "install_local",
  "equip_typology",
  "field_installed",
  "field_operational",
  "op_status",
  "has_maint_plan",
  "plan_followed",
  "failure_free",
  "maint_status",
  "has_contingency",
  "contingency_desc",
  "evidence_code",
  "degradation_desc",
  "extra_comments",
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

// ensureMockCatalog: insert the locations/categories rows the demo data
// references (mock ids: locations 1..8, categories 0..28). db:migrate no
// longer seeds these tables - they mirror the live tenant - so the seed
// brings its own rows. Labels that already exist keep their live ids (a
// database the poller populated first); the returned maps translate
// mock id -> live id for the barrier rows below. Never renumbers.
async function ensureMockCatalog(): Promise<{
  locations: Map<number, number>;
  categories: Map<number, number>;
}> {
  const locNeeds = LOCATION_DIST_BY_ID.map((loc) => {
    const known = LOCATIONS.find((l) => l.code === loc.code);
    return {
      id: loc.id,
      code: loc.code,
      type: known?.type ?? "Instalação",
      name: known?.name ?? null,
    };
  });
  const catNeeds = Object.entries(CATEGORY_CODES).map(([id, label]) => ({
    id: Number(id),
    label,
  }));
  const locations = await resolveCatalogIds(
    "locations",
    "code",
    locNeeds.map((l) => ({ id: l.id, key: l.code })),
    locNeeds.map((l) => [l.id, l.code, l.type, l.name]),
  );
  const categories = await resolveCatalogIds(
    "categories",
    "label",
    catNeeds.map((c) => ({ id: c.id, key: c.label })),
    catNeeds.map((c) => [c.id, c.label]),
  );
  return { locations, categories };
}

// resolveCatalogIds: map each needed mock id to the row id holding its
// key, inserting missing keys (mock id first, max(id)+1 on collision).
async function resolveCatalogIds(
  table: "locations" | "categories",
  keyCol: "code" | "label",
  needs: Array<{ id: number; key: string }>,
  insertCols: unknown[][],
): Promise<Map<number, number>> {
  const load = async () =>
    await queryRows<{ id: number; key: string }>(
      `select id, ${keyCol} as key from ${table}`,
    );
  let rows = await load();
  const byKey = new Map(rows.map((r) => [r.key, r.id]));
  const missing = needs.filter((n) => !byKey.has(n.key));
  if (missing.length > 0) {
    const cols = table === "locations"
      ? "(id, code, type, name)"
      : "(id, label)";
    const wanted = new Map(insertCols.map((r) => [r[1], r]));
    // One multi-row insert with the mock ids; conflicting rows skip.
    const groups: string[] = [];
    const args: unknown[] = [];
    for (const m of missing) {
      const row = wanted.get(m.key) ?? [m.id, m.key];
      const cells: string[] = [];
      for (const v of row) {
        args.push(v);
        cells.push(`$${args.length}`);
      }
      groups.push(`(${cells.join(", ")})`);
    }
    await exec(
      `insert into ${table} ${cols} values ${groups.join(", ")} ` +
        `on conflict do nothing`,
      args,
    );
    rows = await load();
    for (const r of rows) byKey.set(r.key, r.id);
    const stillMissing = missing.filter((m) => !byKey.has(m.key));
    if (stillMissing.length > 0) {
      // Mock id collided with another key: allocate past max(id).
      let next = rows.reduce((m, r) => Math.max(m, r.id), -1) + 1;
      for (const m of stillMissing) {
        const row = [...(wanted.get(m.key) ?? [next, m.key])];
        row[0] = next++;
        const cells = row.map((_, k) => `$${k + 1}`);
        await exec(
          `insert into ${table} ${cols} values (${cells.join(", ")}) ` +
            `on conflict do nothing`,
          row,
        );
      }
      rows = await load();
      for (const r of rows) byKey.set(r.key, r.id);
    }
  }
  const mapped = new Map<number, number>();
  for (const n of needs) mapped.set(n.id, byKey.get(n.key) ?? n.id);
  return mapped;
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
  const allBarriers = getWireBarriers();
  // external_code is UNIQUE in Postgres but the deterministic generator
  // reuses codes across its 6800 rows: keep the first row per code so the
  // demo insert never trips the constraint (mock mode is unaffected -
  // in-memory rows have no uniqueness rule).
  const seenCodes = new Set<string>();
  const barriers = allBarriers.filter((b) => {
    const code = b.externalCode ?? "";
    if (code !== "" && seenCodes.has(code)) return false;
    seenCodes.add(code);
    return true;
  });
  console.log(
    `  generated ${barriers.length} barriers (${allBarriers.length} before code dedupe)`,
  );

  // Mock ids are stable in the generator but the tables mirror the live
  // tenant: translate mock location/category ids to the rows holding
  // their labels (identity on a fresh database).
  const catalog = await ensureMockCatalog();

  let inserted = 0;
  let historyInserted = 0;

  for (let i = 0; i < barriers.length; i += BATCH_SIZE) {
    const chunk = barriers.slice(i, i + BATCH_SIZE);

    const barrierRows: BarrierInsert[] = chunk.map((b) => ({
      tag: b.tag,
      typology_id: b.typologyId,
      location_id: catalog.locations.get(b.locationId) ?? b.locationId,
      loc_desc_id: b.locDescId,
      criticality_id: b.criticalityId,
      category_id: catalog.categories.get(b.categoryId) ?? b.categoryId,
      grouping_id: b.groupingId,
      owner_id: b.ownerId < 0 ? null : b.ownerId,
      availability_id: b.availabilityId,
      comments: b.comments,
      action_plan: b.actionPlan,
      status_since: b.statusSince,
      external_code: b.externalCode,
      is_active: b.isActive ?? true,
      deleted_at: b.deletedAt ?? null,
      origin: b.origin,
      install_local: b.installLocal,
      equip_typology: b.equipTypology,
      field_installed: b.fieldInstalled,
      field_operational: b.fieldOperational,
      op_status: b.opStatus,
      has_maint_plan: b.hasMaintPlan,
      plan_followed: b.planFollowed,
      failure_free: b.failureFree,
      maint_status: b.maintStatus,
      has_contingency: b.hasContingency,
      contingency_desc: b.contingencyDesc,
      evidence_code: b.evidenceCode,
      degradation_desc: b.degradationDesc,
      extra_comments: b.extraComments,
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
