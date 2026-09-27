// geral-coverage - GERAL sheet vs monitor coverage report (read-only).
// This is why it exists: scope changes (keyword -> ESO-OR-keyword -> all
// equipment) must move one number - share of manual-barrier codes present
// in the monitor - so every phase gets a before/after measurement from the
// same script. Run with: deno run -A --env-file=.env scripts/geral-coverage.ts
import { Pool } from "@db/postgres";

import * as XLSX from "xlsx";

const SHEET_PATH = new URL("../test/inventory.xlsx", import.meta.url);

// Accent/case/space-insensitive header key.
function fold(value: unknown): string {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(
    /[\u0300-\u036f]/g,
    "",
  ).replace(/\s+/g, " ").trim();
}

function codeOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "" || /^não encontrado$/i.test(t) || t === "-") return null;
    const n = Number(t);
    return Number.isFinite(n) ? String(Math.trunc(n)) : t;
  }
  return null;
}

async function main() {
  const buf = await Deno.readFile(SHEET_PATH);
  const book = XLSX.read(buf, { type: "buffer" });
  const sheet = book.Sheets["GERAL"];
  if (!sheet) {
    console.error("GERAL sheet not found in test/inventory.xlsx");
    Deno.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const header = rows[1] as unknown[];
  const col = (names: string[]): number => {
    for (let i = 0; i < header.length; i++) {
      if (names.includes(fold(header[i]))) return i;
    }
    return -1;
  };
  const codeCol = col(["codigo sistema de gerenciamento da manutencao"]);
  const tagCol = col(["barreira de seguranca + tag ou localidade"]);
  const concCol = col(["concessao"]);
  const catCol = col(["categoria da barreira de seguranca"]);
  if (codeCol < 0) {
    console.error("code column not found in GERAL header");
    Deno.exit(1);
  }
  const data = rows.slice(2);
  const byCode = new Map<string, { tag: string; conc: string; cat: string }>();
  let codeless = 0;
  for (const r of data) {
    const code = codeOf((r as unknown[])[codeCol]);
    if (!code) {
      codeless++;
      continue;
    }
    if (!byCode.has(code)) {
      byCode.set(code, {
        tag: String((r as unknown[])[tagCol] ?? "").slice(0, 60),
        conc: String((r as unknown[])[concCol] ?? "").trim() || "<blank>",
        cat: String((r as unknown[])[catCol] ?? "").trim() || "<blank>",
      });
    }
  }
  const codes = [...byCode.keys()];
  const pool = new Pool(Deno.env.get("DATABASE_URL")!, 1, true);
  const client = await pool.connect();
  let dbRows: Array<{
    external_code: string;
    scope_source: string | null;
    criticality: string;
    deleted_at: string | null;
  }> = [];
  try {
    const res = await client.queryObject<typeof dbRows[number]>(
      `select b.external_code, b.scope_source, c.label as criticality,
              b.deleted_at::text
         from barriers b join criticality_levels c on c.id = b.criticality_id
        where b.external_code = any($1)`,
      [codes],
    );
    dbRows = res.rows;
  } finally {
    client.release();
    await pool.end();
  }
  const found = new Map(dbRows.map((r) => [r.external_code, r]));
  let present = 0;
  let deleted = 0;
  const missingByCat = new Map<string, number>();
  const missingByConc = new Map<string, number>();
  const missingSample: string[] = [];
  for (const code of codes) {
    const hit = found.get(code);
    if (hit && !hit.deleted_at) {
      present++;
      continue;
    }
    if (hit?.deleted_at) {
      deleted++;
      continue;
    }
    const meta = byCode.get(code)!;
    missingByCat.set(meta.cat, (missingByCat.get(meta.cat) ?? 0) + 1);
    missingByConc.set(meta.conc, (missingByConc.get(meta.conc) ?? 0) + 1);
    if (missingSample.length < 15) missingSample.push(code);
  }
  const total = codes.length;
  const missing = total - present - deleted;
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`GERAL coverage vs monitor`);
  console.log(`  unique codes: ${total} (+${codeless} codeless rows)`);
  console.log(
    `  present: ${present} (${
      (100 * present / total).toFixed(1)
    }%) | soft-deleted: ${deleted} | missing: ${missing}`,
  );
  console.log(`  missing by category:`);
  for (const [k, v] of top(missingByCat, 12)) console.log(`    ${v}  ${k}`);
  console.log(`  missing by concession:`);
  for (const [k, v] of top(missingByConc, 10)) console.log(`    ${v}  ${k}`);
  console.log(`  missing sample: ${missingSample.join(", ")}`);
  const scopeMix = new Map<string, number>();
  for (const r of dbRows) {
    if (r.deleted_at) continue;
    const s = r.scope_source || "<none>";
    scopeMix.set(s, (scopeMix.get(s) ?? 0) + 1);
  }
  console.log(`  present scope mix:`);
  for (const [k, v] of [...scopeMix.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${v}  ${k}`);
  }
}

try {
  await main();
} catch (err) {
  console.error("coverage failed:", err);
  Deno.exit(1);
}
