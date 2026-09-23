// extract-sheet-options - pools distinct GERAL values per sheet question.
// Why: admin option defaults must come from the team's real workbook (not
// guesses), with case/space/accent typos grouped so reviewers pick one
// canonical spelling per meaning. Writes scripts/sheet-options.json.
import { readFile } from "node:fs/promises";
import * as XLSX from "npm:xlsx@0.18.5";

// Workbook location relative to the repo root (script runs from anywhere).
const SHEET_PATH = new URL("../test/inventory.xlsx", import.meta.url);
const OUT_PATH = new URL("./sheet-options.json", import.meta.url);

// Header text (normalized) to Barrier sheet-field key. Matched against the
// GERAL header row so column moves do not silently shift the pools.
const COLUMNS: Record<string, string> = {
  ",": "origin",
  "local de instalacao": "installLocal",
  "tipologia equipamento": "equipTypology",
  "criticidade": "criticality",
  "fora de operacao?": "outOfService",
  "categoria da barreira de seguranca": "category",
  "elemento instalado em campo?": "fieldInstalled",
  "elemento encontra-se operacional ?": "fieldOperational",
  "status de disponibilidade (operacional)": "opStatus",
  "possui plano de manutencao ?": "hasMaintPlan",
  "plano de manutencao sendo cumprido?": "planFollowed",
  "ausencia de falha ou defeito da barreira ?": "failureFree",
  "status de disponibilidade (manutencao)": "maintStatus",
  "ha contingencia?": "hasContingency",
  "codigo da evidencia": "evidenceCode",
  "status final da barreira": "finalStatus",
  "status de conformidade": "compliance",
};

// Free-text columns: keep top values plus unique count instead of full pools.
const FREE_TEXT = new Set(["origin", "installLocal", "evidenceCode"]);
const FREE_TEXT_KEEP = 60;

// Accent/case/space-insensitive key, mirroring foldText in barrier-rules.ts
// plus whitespace collapsing so "Polo  Cricaré" meets "Polo Cricare".
function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

function clean(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

interface ValueCount {
  value: string;
  count: number;
  foldedVariants: string[];
}

interface FieldPool {
  header: string;
  total: number;
  blank: number;
  uniqueRaw: number;
  canonical: ValueCount[];
  typos: { from: string; to: string; count: number }[];
}

// Groups raw values by folded key; canonical is top count (ties: raw asc).
// Every non-canonical raw spelling in a group is reported as a typo fix.
function pool(values: string[]): Omit<FieldPool, "header"> {
  const groups = new Map<string, Map<string, number>>();
  for (const v of values) {
    const key = fold(v);
    let g = groups.get(key);
    if (!g) groups.set(key, g = new Map());
    g.set(v, (g.get(v) ?? 0) + 1);
  }
  const ranked = [...groups.entries()].map(([key, raws]) => {
    const sorted = [...raws.entries()].sort((a, b) =>
      b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
    );
    const topCount = sorted.reduce((n, [, c]) => n + c, 0);
    return { key, top: sorted[0][0], topCount, raws: sorted };
  }).sort((a, b) => b.topCount - a.topCount || (a.top < b.top ? -1 : 1));
  const canonical: ValueCount[] = ranked.map((r) => ({
    value: r.top,
    count: r.topCount,
    foldedVariants: r.raws.slice(1).map(([v]) => v),
  }));
  const typos = ranked.flatMap((r) =>
    r.raws.slice(1).map(([v, c]) => ({ from: v, to: r.top, count: c }))
  ).sort((a, b) => b.count - a.count);
  return {
    total: values.length,
    blank: 0,
    uniqueRaw: groups.size,
    canonical,
    typos,
  };
}

async function main(): Promise<void> {
  const buf = await readFile(SHEET_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets["GERAL"];
  if (!ws) throw new Error("GERAL sheet not found");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
  });
  const header = (rows[1] ?? []).map((h) =>
    typeof h === "string" ? fold(h) : ""
  );
  const wanted = new Map<number, string>();
  header.forEach((h, i) => {
    const key = COLUMNS[h];
    if (key && !wanted.has(i)) wanted.set(i, key);
  });
  if (wanted.size === 0) throw new Error("no mapped columns in header row");
  const buckets = new Map<string, { header: string; values: string[] }>();
  let dataRows = 0;
  for (const row of rows.slice(2)) {
    if (!Array.isArray(row)) continue;
    dataRows++;
    for (const [i, key] of wanted) {
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { header: String(rows[1][i]), values: [] });
      const v = clean(row[i]);
      if (v) b.values.push(v);
    }
  }
  const fields: Record<string, FieldPool> = {};
  for (const [key, b] of buckets) {
    const p = pool(b.values);
    const blank = dataRows - b.values.length;
    fields[key] = {
      header: b.header,
      total: dataRows,
      blank,
      uniqueRaw: p.uniqueRaw,
      canonical: FREE_TEXT.has(key)
        ? p.canonical.slice(0, FREE_TEXT_KEEP)
        : p.canonical,
      typos: p.typos,
    };
  }
  const out = {
    generatedAt: new Date().toISOString(),
    source: "test/inventory.xlsx#GERAL",
    dataRows,
    fields,
  };
  await Deno.writeTextFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  const typoCount = Object.values(fields).reduce(
    (n, f) => n + f.typos.length,
    0,
  );
  console.log(
    `rows=${dataRows} fields=${
      Object.keys(fields).length
    } typoGroups=${typoCount} -> scripts/sheet-options.json`,
  );
}

await main();
