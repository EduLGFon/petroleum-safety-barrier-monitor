// Fracttal dump import - rebuilds the dashboard DB from a dump directory.
// This is why it exists: `db:seed` inserts random demo rows, and the live
// catalog (dozens of stations, hundreds of categories) cannot be seeded by
// hand. This script streams the dump files (locations/equipment -> WOs/WRs,
// low memory, one object at a time), truncates the data tables, rebuilds the
// dynamic lookup tables (locations, categories) from real equipment, derives
// each barrier's availability from open corrective work orders/requests
// (docs/FRACTTAL-DATA.md section 4), and writes barriers + one import stamp
// per barrier into barrier_status_history.
// Run (dry report first):  deno run -A --env-file=.env scripts/fracttal-import.ts --dir test/fracttal-dump-2026-09-14-04-34-49
// Run (write to DB):      ... same command with --apply
// Prerequisite: `deno task db:migrate` (schema + static lookup tables).
// Read-only unless --apply is passed: the table truncation only happens on apply.
import {
  AUTHOR_IMPORT,
  categoryFor,
  classifyCorrective,
  classifyRequest,
  earliestDate,
  exclusionReason,
  IMPORT_NOTE,
  isBarrierCandidate,
  isClosedRequestStatus,
  isoDate,
  locationTypeOf,
  mergeEvent,
  resolveAvailability,
  stationCodeOf,
  stationNameOf,
  type StatusEvent,
  tagFor,
  typologyIdOf,
} from "../lib/server/fracttal/barrier-rules.ts";

import { Pool } from "@db/postgres";

// Number of rows per multi-value INSERT (barriers + history).
const BATCH_SIZE = 500;

const DEFAULT_DIR = "test/fracttal-dump-2026-09-14-04-34-49";

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

type InsertRow = Record<string, unknown>;

// str reads a dump string field. Domain rules (folding, scope, station,
// typology, dates, events) live in lib/server/fracttal/barrier-rules.ts.
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Streams a JSON array file one top-level object at a time. Keeps only the
// current object's text (or a few KB of it), so a 305 MB array never loads
// into memory. Tracks string/escape state to ignore braces inside strings.
async function* streamJsonArray(
  path: string,
): AsyncGenerator<Record<string, unknown>> {
  const file = await Deno.open(path);
  const decoder = new TextDecoder();
  let carry = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buf = "";
  try {
    for await (const chunk of file.readable) {
      carry += decoder.decode(chunk, { stream: true });
      for (const ch of carry) {
        if (escaped) {
          escaped = false;
          buf += ch;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          buf += ch;
          continue;
        }
        if (inString) {
          if (ch === '"') inString = false;
          buf += ch;
          continue;
        }
        if (ch === '"') {
          inString = true;
          buf += ch;
          continue;
        }
        if (ch === "{") {
          depth += 1;
          buf += ch;
          continue;
        }
        if (ch === "}") {
          depth -= 1;
          buf += ch;
          if (depth === 0) {
            if (buf.trimStart().startsWith("{")) {
              yield JSON.parse(buf) as Record<string, unknown>;
            }
            buf = "";
          }
          continue;
        }
        if (depth === 0) {
          // Between objects: only whitespace and commas; skip them.
          continue;
        }
        buf += ch;
      }
      carry = "";
    }
  } finally {
    // The stream owns the handle once fully read; ignore an already-closed file.
    try {
      file.close();
    } catch {
      // close failed because the stream already released the resource
    }
  }
}

// One equipment row distilled down to what the import needs.
interface EquipmentRow {
  code: string;
  description: string;
  parentDescription: string;
  groupsDescription: string;
  outOfServiceDate: string | null;
}

// Aggregated per-barrier state built while scanning WOs/WRs. Work-event
// slots use the shared StatusEvent shape so both paths merge identically.
interface BarrierAcc extends EquipmentRow {
  station: string;
  category: string;
  planned: StatusEvent | null;
  urgent: StatusEvent | null;
  stopAssets: boolean;
}

// extractEvent distills a dump work order/request row to a shared status
// event: earliest of the candidate date fields plus folio + description.
function extractEvent(row: Record<string, unknown>): StatusEvent {
  const folio = str(row.wo_folio);
  const desc = str(row.description);
  return {
    date: earliestDate(
      isoDate(row.initial_date),
      earliestDate(isoDate(row.date_maintenance), isoDate(row.creation_date)),
    ),
    source: (folio ? `${folio}: ${desc}` : desc).slice(0, 800),
  };
}

// Applies one work order to the barrier map; returns the match kind for the report.
function applyWorkOrder(
  barriers: Map<string, BarrierAcc>,
  wo: Record<string, unknown>,
): "matched" | "unmatched" | "not-corrective" {
  const acc = barriers.get(str(wo.code));
  if (!acc) return "unmatched";
  if (wo.done !== false) return "not-corrective";
  const slot = classifyCorrective(
    str(wo.tasks_log_types_description),
    str(wo.types_description),
  );
  if (slot === "planned") {
    acc.planned = mergeEvent(acc.planned, extractEvent(wo));
  } else if (slot === "urgent") {
    acc.urgent = mergeEvent(acc.urgent, extractEvent(wo));
  }
  if (wo.stop_assets === true) acc.stopAssets = true;
  return "matched";
}

// Applies one work request; closed WRs (solved/cancelled/rejected) are ignored.
function applyWorkRequest(
  barriers: Map<string, BarrierAcc>,
  wr: Record<string, unknown>,
): "matched" | "unmatched" | "not-corrective" {
  const acc = barriers.get(str(wr.code_item));
  if (!acc) return "unmatched";
  const statusId = typeof wr.id_status === "number" ? wr.id_status : null;
  if (isClosedRequestStatus(statusId)) return "not-corrective";
  const slot = classifyRequest(str(wr.types_2_description));
  if (slot === null) return "not-corrective";
  if (slot === "urgent") acc.urgent = mergeEvent(acc.urgent, extractEvent(wr));
  else acc.planned = mergeEvent(acc.planned, extractEvent(wr));
  return "matched";
}

function buildInsert(
  table: string,
  cols: readonly string[],
  rows: InsertRow[],
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

async function main() {
  const args = new Set(Deno.args);
  const apply = args.has("--apply");
  const dir = Deno.args.find((a) => a !== "--apply" && !a.startsWith("--")) ??
    DEFAULT_DIR;

  const connectionString = Deno.env.get("DATABASE_URL");
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    Deno.exit(1);
  }
  const pool = new Pool(connectionString, 1, true);
  const queryRows = async <T>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    const client = await pool.connect();
    try {
      const result = await client.queryObject<T>(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  };
  const exec = (text: string, params: unknown[] = []) =>
    queryRows(text, params);

  const eqPath = `${dir}/items-2-equipment.json`;
  const woPath = `${dir}/work-orders.json`;
  const wrPath = `${dir}/work-requests.json`;

  console.log(`Fracttal dump import`);
  console.log(`  dir:   ${dir}`);
  console.log(
    `  apply: ${apply ? "YES (will truncate + write)" : "no (report only)"}\n`,
  );

  // ── Pass A: equipment ────────────────────────────────────────────────────
  // Builds the barrier set, the station set and the category set. Only the
  // barrier-scope rows are kept; everything else is reported and dropped.
  const barriers = new Map<string, BarrierAcc>();
  // stations maps code -> display name (first canonical segment wins;
  // override segments yield null and never overwrite - the catalog row
  // borrows the canonical name, falling back to the code at read time).
  const stations = new Map<string, string | null>();
  const categories = new Set<string>();
  let equipmentSeen = 0;
  let candidates = 0;
  let excluded = 0;
  for await (const row of streamJsonArray(eqPath)) {
    equipmentSeen += 1;
    const code = str(row.code);
    if (code === "") continue;
    const groupsDescription = str(row.groups_description);
    if (!isBarrierCandidate(groupsDescription)) continue;
    // Known non-barriers match the scope by mislabel: skip with a report
    // count, never silently (shared EXCLUDED_EXTERNAL_CODES).
    if (exclusionReason(code) !== null) {
      excluded += 1;
      continue;
    }
    candidates += 1;
    const description = str(row.description);
    const parentDescription = str(row.parent_description);
    const station = stationCodeOf(parentDescription);
    const category = categoryFor(groupsDescription);
    const stationName = stationNameOf(parentDescription);
    if (!stations.has(station) || stations.get(station) == null) {
      stations.set(station, stationName);
    }
    categories.add(category);
    barriers.set(code, {
      code,
      description,
      parentDescription,
      groupsDescription,
      outOfServiceDate: isoDate(row.initial_date_out_of_service),
      station,
      category,
      planned: null,
      urgent: null,
      stopAssets: false,
    });
  }
  console.log(
    `Pass A (equipment): ${equipmentSeen} rows, ${candidates} barrier candidates, ` +
      `${stations.size} stations, ${categories.size} categories, ${excluded} excluded`,
  );

  // ── Pass B / C: work orders + work requests ──────────────────────────────
  let woSeen = 0;
  let woMatched = 0;
  let wrSeen = 0;
  let wrMatched = 0;
  for await (const wo of streamJsonArray(woPath)) {
    woSeen += 1;
    if (applyWorkOrder(barriers, wo) === "matched") woMatched += 1;
    if (woSeen % 20000 === 0) {
      console.log(`  work orders scanned: ${woSeen}...`);
    }
  }
  console.log(
    `Pass B (work orders): ${woSeen} scanned, ${woMatched} hit a barrier`,
  );
  for await (const wr of streamJsonArray(wrPath)) {
    wrSeen += 1;
    if (applyWorkRequest(barriers, wr) === "matched") wrMatched += 1;
  }
  console.log(
    `Pass C (work requests): ${wrSeen} scanned, ${wrMatched} hit a barrier`,
  );

  // ── Derived status per barrier ────────────────────────────────────────────
  // Shared precedence (lib/server/fracttal/barrier-rules.ts): open emergency
  // corrective -> Indisponível (5); open planned corrective -> Degradada (4);
  // stopped asset or out-of-service date -> Fora de Operação (1); asset
  // flagged unavailable -> Indisponível (5); otherwise Disponível (0). The
  // asset flag is passed as available: the dump semantics for that column
  // are unverified, so the import derives status from work events only.
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (acc: BarrierAcc) =>
    resolveAvailability(
      {
        urgent: acc.urgent,
        planned: acc.planned,
        stopAssets: acc.stopAssets,
        outOfServiceDate: acc.outOfServiceDate,
        assetAvailable: true,
      },
      today,
    );

  const byStatus = new Map<number, number>();
  for (const acc of barriers.values()) {
    const s = statusOf(acc).availabilityId;
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  console.log(
    `\nDerived availability: ${
      [...byStatus.entries()].map(([s, n]) => `[${s}] ${n}`).join(", ")
    }`,
  );

  if (!apply) {
    console.log(
      `\nDry run complete. Re-run with --apply to truncate the data tables, ` +
        `rebuild lookups, and write ${barriers.size} barriers + history.`,
    );
    await pool.end();
    return;
  }

  // ── Apply: truncate, rebuild lookups, insert barriers + history ──────────
  await exec(
    "truncate table barrier_status_history, barriers, sync_state, alert_events restart identity cascade",
  );
  await exec("truncate table locations, categories restart identity cascade");

  const stationList = [...stations.keys()].sort();
  const stationIds = new Map(
    stationList.map((code, i) => [code, i + 1]), // 0 = 'ALL' is UI-only, never a row
  );
  const categoryList = [...categories].sort();
  const categoryIds = new Map(
    categoryList.map((label, i) => [label, i]),
  );

  const locRows = stationList.map((code, i) => ({
    id: i + 1,
    code,
    type: locationTypeOf(code),
    name: stations.get(code) ?? null,
  }));
  const locInsert = buildInsert(
    "locations",
    ["id", "code", "type", "name"] as const,
    locRows,
  );
  await exec(locInsert.text, locInsert.args);
  const catRows = categoryList.map((label, i) => ({ id: i, label }));
  const catInsert = buildInsert(
    "categories",
    ["id", "label"] as const,
    catRows,
  );
  await exec(catInsert.text, catInsert.args);

  console.log(
    `Lookups rebuilt: ${locRows.length} locations, ${catRows.length} categories`,
  );

  const barrierList = [...barriers.values()];
  let inserted = 0;
  let historyInserted = 0;
  for (let i = 0; i < barrierList.length; i += BATCH_SIZE) {
    const chunk = barrierList.slice(i, i + BATCH_SIZE);
    const rows: InsertRow[] = chunk.map((acc) => {
      const s = statusOf(acc);
      return {
        tag: tagFor(acc.description, acc.code),
        typology_id: typologyIdOf(acc.parentDescription),
        location_id: stationIds.get(acc.station) ?? 1,
        loc_desc_id: 0,
        // Sheet inventory is 100% critical barriers; upstream carries no
        // usable criticality signal (priorities almost all null in the dump).
        criticality_id: 1,
        category_id: categoryIds.get(acc.category) ?? 0,
        grouping_id: 0,
        owner_id: null,
        availability_id: s.availabilityId,
        comments: s.note,
        action_plan: "",
        status_since: s.statusSince,
        external_code: acc.code,
      };
    });
    const insert = buildInsert(
      "barriers",
      BARRIER_COLS,
      rows,
      "returning id",
    );
    const returned = await queryRows<{ id: number }>(insert.text, insert.args);
    const historyRows: InsertRow[] = returned.flatMap((row, idx) => {
      const s = statusOf(chunk[idx]);
      return [{
        barrier_id: row.id,
        date: s.statusSince,
        status_id: s.availabilityId,
        author_id: AUTHOR_IMPORT,
        note: IMPORT_NOTE,
      }];
    });
    const hist = buildInsert(
      "barrier_status_history",
      HISTORY_COLS,
      historyRows,
    );
    await exec(hist.text, hist.args);
    historyInserted += historyRows.length;
    inserted += returned.length;
    if (inserted % 1000 < BATCH_SIZE || inserted >= barrierList.length) {
      console.log(`  inserted ${inserted}/${barrierList.length} barriers...`);
    }
  }

  await exec(
    `insert into sync_state (scope, status, inserts, note) values ('dump-import', 'ok', $1, $2)`,
    [barrierList.length, `barrier dump import from ${dir}`],
  );

  console.log(
    `\nDone: ${inserted} barriers, ${historyInserted} history entries, ` +
      `${locRows.length} locations, ${catRows.length} categories.`,
  );
  await pool.end();
}

try {
  await main();
} catch (err) {
  console.error("\nImport failed:", err);
  Deno.exit(1);
}
