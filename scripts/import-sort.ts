// Import sorter - enforces the agents.md rule "imports sorted descending by
// line length" across TS/TSX sources. This is why it exists: deno fmt does
// not encode that rule, so a small deterministic checker/fixer keeps files
// compliant without manual ordering. Pass --fix to rewrite files in place.
// Usage: deno run scripts/import-sort.ts [--fix]
const FIX = Deno.args.includes("--fix");

const STMT_END = /;/;

function isImportStart(t: string): boolean {
  if (/^import\s*\(/.test(t)) return false; // dynamic import
  if (/^import\s*\{/.test(t)) return true;
  if (/^import\s+type\s*\{/.test(t)) return true;
  if (/^import\s*\*/.test(t)) return true;
  if (/^import\s*["']/.test(t)) return true;
  if (/^export\s+type\s*\{/.test(t)) return true;
  if (/^export\s+\{/.test(t)) return true;
  if (/^export\s*\*\s*from/.test(t)) return true;
  if (/^export\s+\{.+\}\s*from/.test(t)) return true;
  return false;
}

// Logical single-line length of a statement (what its width would be when
// rendered on one line). Multiline import blocks are measured the same way so
// the ordering rule is stable regardless of how deno fmt wraps lines.
function stmtLength(body: string[]): number {
  const joined = body
    .map((l) => l.trim())
    .join(" ")
    .replace(/,\s*}/g, " }")
    .replace(/\s+/g, " ")
    .trim();
  return joined.length;
}

function collectStatements(
  lines: string[],
): Array<{ start: number; end: number; body: string[]; len: number }> {
  const out: Array<
    { start: number; end: number; body: string[]; len: number }
  > = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t !== "" && !t.startsWith("//") && !t.startsWith("/*")) {
      if (isImportStart(t)) {
        const body: string[] = [lines[i]];
        let j = i;
        while (!STMT_END.test(lines[j]) && j + 1 < lines.length) {
          j++;
          body.push(lines[j]);
        }
        out.push({ start: i, end: j, body, len: stmtLength(body) });
        i = j + 1;
        continue;
      }
      break; // stop at first non-import code line
    }
    i++;
  }
  return out;
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    if (
      e.name === "node_modules" || e.name === "_fresh" || e.name === ".next"
    ) {
      continue;
    }
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) {
      yield* walkFiles(p);
    } else if (e.isFile && /\.(ts|tsx)$/.test(e.name)) {
      yield p;
    }
  }
}

async function main() {
  let checked = 0;
  let violated = 0;
  for await (const path of walkFiles(".")) {
    if (path.startsWith("./_fresh/") || path.startsWith("./node_modules/")) {
      continue;
    }
    const text = await Deno.readTextFile(path);
    const lines = text.split("\n");
    const stmts = collectStatements(lines);
    if (stmts.length < 2) continue;
    checked++;
    const sorted = [...stmts].sort((a, b) => b.len - a.len);
    let violation = false;
    for (let k = 0; k < stmts.length; k++) {
      if (stmts[k].start !== sorted[k].start) {
        violation = true;
        break;
      }
    }
    if (!violation) continue;
    violated++;
    if (!FIX) {
      console.log(path);
      continue;
    }
    const rebuilt: string[] = [];
    for (let k = 0; k < stmts[0].start; k++) rebuilt.push(lines[k]);
    for (let k = 0; k < stmts.length; k++) {
      if (k > 0) rebuilt.push("");
      rebuilt.push(...sorted[k].body);
    }
    rebuilt.push("");
    for (let k = stmts[stmts.length - 1].end + 1; k < lines.length; k++) {
      rebuilt.push(lines[k]);
    }
    await Deno.writeTextFile(path, rebuilt.join("\n"));
  }
  console.log(`scanned import sections: ${checked}`);
  console.log(`${FIX ? "fixed" : "violating"} files: ${violated}`);
}

await main();
