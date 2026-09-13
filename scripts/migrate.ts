// Migrate - applies db/schema.sql then db/seed_lookups.sql.
// This is why it exists: idempotent one-command DB setup for Fresh routes.
// Run with: deno task db:migrate
import { Pool } from "@db/postgres";
import { fromFileUrl } from "@std/path";

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env.local first.",
  );
  Deno.exit(1);
}

// Split SQL text into statements, ignoring semicolons inside dollar-quoted
// function bodies ($$...$$), single/double quotes and line/block comments.
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  let tag: string | null = null;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  const tagAt = (pos: number): string | null => {
    const m = /^\$[A-Za-z_]*\$/.exec(text.slice(pos));
    return m ? m[0] : null;
  };
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1] ?? "";
    if (lineComment) {
      buf += ch;
      if (ch === "\n") lineComment = false;
      i++;
      continue;
    }
    if (blockComment) {
      buf += ch;
      if (ch === "*" && next === "/") {
        buf += next;
        i += 2;
        blockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote) {
        // SQL escapes quotes by doubling ('it''s') — consume the pair and
        // stay inside the string instead of splitting mid-literal.
        if (next === quote) {
          buf += next;
          i += 2;
          continue;
        }
        if (text[i - 1] !== "\\") quote = null;
      }
      i++;
      continue;
    }
    if (tag) {
      if (text.startsWith(tag, i)) {
        buf += tag;
        i += tag.length;
        tag = null;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      buf += ch + next;
      i += 2;
      lineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      buf += ch + next;
      i += 2;
      blockComment = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
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
      if (buf.trim() !== ";") out.push(buf);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

const pool = new Pool(connectionString, 1, true);

async function applyFile(url: URL) {
  const path = fromFileUrl(url);
  console.log(`-> applying ${path}`);
  const text = await Deno.readTextFile(path);
  const client = await pool.connect();
  try {
    for (const stmt of splitStatements(text)) {
      await client.queryArray(stmt);
    }
  } finally {
    client.release();
  }
  console.log(`ok ${path} applied`);
}

try {
  await applyFile(new URL("../db/schema.sql", import.meta.url));
  await applyFile(new URL("../db/seed_lookups.sql", import.meta.url));
  console.log("\nMigration complete.");
} catch (err) {
  console.error("\nMigration failed:", err);
  Deno.exit(1);
} finally {
  await pool.end();
}
