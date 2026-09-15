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
import { Pool } from "@db/postgres";

// Number of rows per multi-value INSERT (barriers + history).
const BATCH_SIZE = 500;

// Availability status ids (db/schema.sql + db/seed_lookups.sql + lib/enums.ts).
const AVAIL_AVAILABLE = 0;
const AVAIL_OUT_OF_SERVICE = 1;
const AVAIL_DEGRADED = 4;
const AVAIL_UNAVAILABLE = 5;

// Typology ids (db/seed_lookups.sql); derived from the parent chain, the
// conservative default in lib/server/fracttal/map.ts when nothing matches.
const TYPO_ESTACAO = 0;
const TYPO_PLANTA = 1;
const TYPO_DUTO = 2;
const TYPO_COMPRESSAO = 4;
const TYPO_MEDICAO = 5;
const TYPO_DEFAULT = 3; // 'Base Operacional'

// Author row id used for import stamps ('Sincronização Fracttal').
const AUTHOR_IMPORT = 10;

// Equipment barrier scope - case/accent-insensitive keyword list from
// docs/FRACTTAL-DATA.md section 3, matched against groups_description only
// (the asset-type taxonomy). Description is NOT matched: free text pulls in
// non-barrier types (e.g. a gas pump whose label mentions 'gás'). Every hit
// is imported as a barrier (catalog is data-driven).
const BARRIER_KEYWORDS = [
  "valvula",
  "extintor",
  "detec",
  "alarme",
  "sirene",
  "incendio",
  "bloqueio",
  "intertravamento",
  "seguran",
  "emerg",
  "psv",
  "alivio",
  "hidrante",
  "gas",
  "fumaca",
  "h2s",
  "corta-?chamas",
] as const;

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
] as const;

const HISTORY_COLS = [
  "barrier_id",
  "date",
  "status_id",
  "author_id",
  "note",
] as const;

type InsertRow = Record<string, unknown>;

// Normalizes text for keyword matching: lowercases and folds accents so
// 'Válvula' matches 'valvula' and 'gás' matches 'gas'.
function norm(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// L2 station code from an equipment parent chain. parent_description is
// '/'-separated, e.g. '// Seacrest Petróleo/ Área Norte/ SÃO MATEUS - SM/ ...'.
// Stripping empty segments, index 2 is the field level ('SÃO MATEUS - SM');
// the trailing ' - CODE' token is the station slug (validated against the full
// equipment file: this rule reproduces the documented 39 distinct codes).
function stationCodeOf(parentDescription: string): string {
  const parts = parentDescription
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const seg = parts.length > 2 ? parts[2] : (parts[parts.length - 1] ?? "");
  const m = seg.match(/\s*-\s*([A-Z0-9][A-Z0-9-]*)\s*$/);
  return (m ? m[1] : seg).toUpperCase();
}

// Safety barrier candidate test over the item's taxonomy label only.
function isBarrierCandidate(groupsDescription: string): boolean {
  const re = new RegExp(BARRIER_KEYWORDS.join("|"));
  return re.test(norm(groupsDescription));
}

// Typology from the parent chain (L3+ text): keyword precedence one-pass.
function typologyIdOf(parentDescription: string): number {
  const text = norm(parentDescription);
  if (/compres/.test(text)) return TYPO_COMPRESSAO;
  if (/medic|medid/.test(text)) return TYPO_MEDICAO;
  if (/duto|transfer/.test(text)) return TYPO_DUTO;
  if (/plant|process/.test(text)) return TYPO_PLANTA;
  if (/estac|coletor/.test(text)) return TYPO_ESTACAO;
  return TYPO_DEFAULT;
}

// First 10 chars of an ISO timestamp as YYYY-MM-DD; null for missing/odd input.
function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 10) return null;
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// Earliest of two YYYY-MM-DD dates; null stays neutral (other wins).
function earliestDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
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

// One corrective signal contributing to a barrier's current availability.
interface CorrectiveEvent {
  date: string | null;
  source: string;
}

// Aggregated per-barrier state built while scanning WOs/WRs.
interface BarrierAcc extends EquipmentRow {
  station: string;
  category: string;
  planned: CorrectiveEvent | null;
  urgent: CorrectiveEvent | null;
  stopAssets: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function boolFlag(v: unknown): boolean {
  return v === true;
}

// Applies one work order to the barrier map; returns the match kind for the report.
function applyWorkOrder(
  barriers: Map<string, BarrierAcc>,
  wo: Record<string, unknown>,
): "matched" | "unmatched" | "not-corrective" {
  const acc = barriers.get(str(wo.code));
  if (!acc) return "unmatched";
  const open = wo.done === false;
  if (!open) return "not-corrective";
  const type = norm(str(wo.tasks_log_types_description));
  const failureType = norm(str(wo.types_description));
  if (
    type.includes("corretiva planejada") ||
    failureType.includes("falha potencial")
  ) {
    acc.planned = mergeEvent(acc.planned, wo);
  }
  if (type.includes("corretiva emergencial")) {
    acc.urgent = mergeEvent(acc.urgent, wo);
  }
  if (boolFlag(wo.stop_assets)) acc.stopAssets = true;
  return "matched";
}

// Keeps the earliest date and the most informative source for an event slot;
// if the incoming event has no date but the slot is empty, keep it anyway
// (status still derives to open; status_since then falls back to today).
function mergeEvent(
  current: CorrectiveEvent | null,
  wo: Record<string, unknown>,
): CorrectiveEvent {
  const folio = str(wo.wo_folio);
  const desc = str(wo.description);
  const source = (folio ? `${folio}: ${desc}` : desc).slice(0, 800);
  const incomingDate = earliestDate(
    isoDate(wo.initial_date),
    earliestDate(isoDate(wo.date_maintenance), isoDate(wo.creation_date)),
  );
  if (!current) {
    return { date: incomingDate, source };
  }
  return {
    date: current.date ?? incomingDate,
    source: current.source ? current.source : source,
  };
}

// WR statuses that count as closed: solved (4), cancelled (5), solved via WO
// (6), rejected (12). Everything else is an open request.
const CLOSED_WR_STATUSES = new Set([4, 5, 6, 12]);

// Applies one work request; closed WRs (solved/cancelled/rejected) are ignored.
function applyWorkRequest(
  barriers: Map<string, BarrierAcc>,
  wr: Record<string, unknown>,
): "matched" | "unmatched" | "not-corrective" {
  const acc = barriers.get(str(wr.code_item));
  if (!acc) return "unmatched";
  if (
    typeof wr.id_status === "number" && CLOSED_WR_STATUSES.has(wr.id_status)
  ) {
    return "not-corrective";
  }
  const type = norm(str(wr.types_2_description));
  if (!type.includes("corretiva") && !type.includes("falha")) {
    return "not-corrective";
  }
  if (type.includes("emergencial")) {
    acc.urgent = mergeEvent(acc.urgent, wr);
  } else {
    acc.planned = mergeEvent(acc.planned, wr);
  }
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
  const stations = new Set<string>();
  const categories = new Set<string>();
  let equipmentSeen = 0;
  let candidates = 0;
  for await (const row of streamJsonArray(eqPath)) {
    equipmentSeen += 1;
    const code = str(row.code);
    if (code === "") continue;
    const groupsDescription = str(row.groups_description);
    if (!isBarrierCandidate(groupsDescription)) continue;
    candidates += 1;
    const description = str(row.description);
    const parentDescription = str(row.parent_description);
    const station = stationCodeOf(parentDescription);
    const category = groupsDescription.trim() || "(sem categoria)";
    stations.add(station);
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
      `${stations.size} stations, ${categories.size} categories`,
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
  // Precedence (docs/FRACTTAL-DATA.md section 4): open emergency corrective ->
  // Indisponível (5); open planned corrective -> Degradada (4); asset stopped
  // or out of service -> Fora de Operação (1); otherwise Disponível (0).
  interface StatusOut {
    status: number;
    since: string | null;
    note: string;
  }
  const statusOf = (acc: BarrierAcc): StatusOut => {
    const today = new Date().toISOString().slice(0, 10);
    if (acc.urgent) {
      return {
        status: AVAIL_UNAVAILABLE,
        since: acc.urgent.date ?? today,
        note: acc.urgent.source ?? "",
      };
    }
    if (acc.planned) {
      return {
        status: AVAIL_DEGRADED,
        since: acc.planned.date ?? today,
        note: acc.planned.source ?? "",
      };
    }
    if (acc.stopAssets || acc.outOfServiceDate) {
      return {
        status: AVAIL_OUT_OF_SERVICE,
        since: acc.outOfServiceDate ?? today,
        note: acc.outOfServiceDate ? "Equipamento fora de operação" : "",
      };
    }
    return { status: AVAIL_AVAILABLE, since: today, note: "" };
  };

  const byStatus = new Map<number, number>();
  for (const acc of barriers.values()) {
    const s = statusOf(acc).status;
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

  const stationList = [...stations].sort();
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
    type: code.includes("DUTO")
      ? "Duto de Transferência"
      : /MOVEL|MÓVEL|TESTE/.test(code)
      ? "Unidade Móvel"
      : "Instalação",
  }));
  const locInsert = buildInsert(
    "locations",
    ["id", "code", "type"] as const,
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
        tag: acc.description || acc.code,
        typology_id: typologyIdOf(acc.parentDescription),
        location_id: stationIds.get(acc.station) ?? 1,
        loc_desc_id: 0,
        criticality_id: 0,
        category_id: categoryIds.get(acc.category) ?? 0,
        grouping_id: 0,
        owner_id: null,
        availability_id: s.status,
        comments: s.note,
        action_plan: "",
        status_since: s.since,
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
        date: s.since,
        status_id: s.status,
        author_id: AUTHOR_IMPORT,
        note: "Importado do Fracttal",
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
