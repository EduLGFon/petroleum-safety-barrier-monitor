// Migration order checker - fails when an index references a column that
// does not exist yet at that point in db/schema.sql.
// This is why it exists: CREATE TABLE IF NOT EXISTS is a no-op on
// pre-existing databases, so an index placed before its ALTER TABLE ...
// ADD COLUMN stanza migrates clean databases but fails real ones with
// `column "x" does not exist` (ComputeIndexAttrs). Fresh-DB testing never
// catches that; this static check does, with no database required.
// Run: deno run --allow-read=db/schema.sql scripts/check-migration-order.ts
// It is part of `deno task check`, and exits 1 listing every violation.
export interface OrderViolation {
  line: number;
  index: string;
  table: string;
  column: string;
}

// Keywords that can open a line inside a CREATE TABLE body without naming
// a column (table-level constraints). Anything else opening a line is a
// column definition whose first identifier is the column name.
const CONSTRAINT_OPENERS = new Set([
  "primary",
  "foreign",
  "unique",
  "check",
  "constraint",
  "like",
  "exclude",
]);

// Splits SQL into statements, dropping -- line comments. Dollar-quoted
// ($$...$$) bodies and single-quoted strings (with '' escapes) never split,
// so function bodies survive as one statement. Returns each statement with
// its 1-based starting line for violation reports.
export function splitStatements(
  text: string,
): Array<{ sql: string; line: number }> {
  const out: Array<{ sql: string; line: number }> = [];
  let buf = "";
  let line = 1;
  let stmtLine = 1;
  let fresh = true;
  let quote: string | null = null;
  let tag: string | null = null;
  let lineComment = false;
  const tagAt = (pos: number): string | null => {
    const m = /^\$[A-Za-z_]*\$/.exec(text.slice(pos));
    return m ? m[0] : null;
  };
  const flush = () => {
    if (buf.trim() !== "" && buf.trim() !== ";") {
      out.push({ sql: buf, line: stmtLine });
    }
    buf = "";
    fresh = true;
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1] ?? "";
    if (ch === "\n") line++;
    // First non-blank character after a flush opens the next statement,
    // so its recorded line is where the statement starts, not where the
    // previous one ended. Comments and blank lines never open one.
    if (fresh && ch.trim() !== "") {
      stmtLine = line;
      fresh = false;
    }
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      i++;
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote) {
        if (next === quote) {
          buf += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }
    if (tag) {
      buf += ch;
      if (text.startsWith(tag, i)) {
        buf += tag.slice(1);
        i += tag.length;
        tag = null;
        continue;
      }
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      lineComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      quote = ch;
      buf += ch;
      i++;
      continue;
    }
    const t = tagAt(i);
    if (t) {
      tag = t;
      buf += t;
      i += t.length;
      continue;
    }
    if (ch === ";") {
      buf += ch;
      flush();
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// Reads the balanced (...) column list starting at an opening paren.
// Returns the inner text, or null when unbalanced.
function balancedInner(sql: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

// checkSchemaOrder: every CREATE INDEX column must exist at that point in
// the file. Columns declared only in CREATE TABLE exist solely on clean
// databases (the statement is a no-op where the table already lives), so a
// column that is ALSO added by an ALTER TABLE ... ADD COLUMN anywhere in
// the file is a retrofitted column: indexes on it must follow the ALTER,
// or pre-existing databases fail with `column "x" does not exist`.
// Expression items (containing parens or operators) carry no plain column
// contract - they are skipped instead of false alarming.
export function checkSchemaOrder(text: string): OrderViolation[] {
  const violations: OrderViolation[] = [];
  const statements = splitStatements(text);
  // Pass 1: retrofitted columns - every (table, column) pair with an
  // ADD COLUMN stanza anywhere in the file.
  const retrofitted = new Set<string>();
  for (const { sql } of statements) {
    const addColumn =
      /alter\s+table\s+([A-Za-z_][A-Za-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)/i
        .exec(sql);
    if (addColumn) {
      retrofitted.add(
        `${addColumn[1].toLowerCase()}.${addColumn[2].toLowerCase()}`,
      );
    }
  }
  // Pass 2: in-order walk. Plain columns pass when declared in CREATE TABLE
  // or added by an earlier ALTER; retrofitted columns additionally require
  // that earlier ALTER, since CREATE TABLE alone never upgrades old DBs.
  const columns = new Map<string, Set<string>>();
  const altered = new Set<string>();
  for (const { sql, line } of statements) {
    const createTable =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)/i
        .exec(sql);
    if (createTable) {
      const table = createTable[1].toLowerCase();
      const set = columns.get(table) ?? new Set<string>();
      const open = sql.indexOf("(");
      const inner = open < 0 ? null : balancedInner(sql, open);
      // The body is single-level for column lines here; commas inside
      // inline CHECK (...) constraints would over-split, so only the first
      // identifier of each comma part is read and constraint openers skip.
      for (const part of (inner ?? "").split(",")) {
        const first = /^[A-Za-z_][A-Za-z0-9_]*/.exec(part.trim());
        if (first && !CONSTRAINT_OPENERS.has(first[0].toLowerCase())) {
          set.add(first[0].toLowerCase());
        }
      }
      columns.set(table, set);
      continue;
    }
    const addColumn =
      /alter\s+table\s+([A-Za-z_][A-Za-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)/i
        .exec(sql);
    if (addColumn) {
      const table = addColumn[1].toLowerCase();
      const column = addColumn[2].toLowerCase();
      const set = columns.get(table) ?? new Set<string>();
      set.add(column);
      columns.set(table, set);
      altered.add(`${table}.${column}`);
      continue;
    }
    const createIndex =
      /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+on\s+([A-Za-z_][A-Za-z0-9_]*)/i
        .exec(sql);
    if (createIndex) {
      const table = createIndex[2].toLowerCase();
      const onPos = sql.toLowerCase().indexOf(" on ");
      const open = sql.indexOf("(", onPos);
      const inner = open < 0 ? null : balancedInner(sql, open);
      if (inner === null) continue;
      for (const item of inner.split(",")) {
        const trimmed = item.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) continue;
        const column = trimmed.toLowerCase();
        const key = `${table}.${column}`;
        const exists = columns.get(table)?.has(column) ?? false;
        if (!exists || (retrofitted.has(key) && !altered.has(key))) {
          violations.push({ line, index: createIndex[1], table, column });
        }
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const path = Deno.args[0] ?? "db/schema.sql";
  const text = await Deno.readTextFile(path);
  const violations = checkSchemaOrder(text);
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(
        `${path}:${v.line}: index "${v.index}" on "${v.table}" ` +
          `references missing column "${v.column}" - move the index after ` +
          `the ALTER TABLE ... ADD COLUMN stanza`,
      );
    }
    Deno.exit(1);
  }
  console.log(`ok ${path}: every index follows its column`);
}
