// Unit tests for scripts/doctor.ts pure helpers (no DB needed).
// This is why it exists: doctor gates production setup, so its .env reader
// must round-trip exactly what Setup-Production.ps1 writes (no escapes: the
// writer fails closed on `"`/`\` and plain-quotes whitespace, `#` and
// single-quote values)
// and its missing-table mapping must stay warn-only on fresh databases
// (42P01/undefined_table) without masking real connection failures.
import { isMissingTable, parseEnvFile } from "./doctor.ts";

import { assertEquals } from "jsr:@std/assert@^1";

// formatDotEnvValue mirrors Format-DotEnvValue in
// deploy/windows/Setup-Production.ps1: fail closed on `"` or `\` (escapes are
// never emitted, because Deno `--env-file` keeps them literal while this
// reader unescapes), quote on whitespace/#/' (quoting preserves
// leading/trailing spaces), else bare. Kept in the test (not the reader) so a
// writer change breaks the round-trip here first. `'` is quoted because a
// bare `'single'`-shaped value would lose its quotes in both readers.
function formatDotEnvValue(value: string): string {
  if (/["\\]/.test(value)) {
    throw new Error(`value contains a double quote or backslash: ${value}`);
  }
  if (value === "" || /[\s#']/.test(value)) {
    return `"${value}"`;
  }
  return value;
}

// denoEnvFileRead mirrors what Deno's `--env-file` loader does with a quoted
// value: strip the outer double quotes, keep the content literal (no escape
// processing). Writer output must read identically through both readers.
function denoEnvFileRead(line: string): string {
  const val = line.slice(line.indexOf("=") + 1).trim();
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
    return val.slice(1, -1);
  }
  return val;
}

// The accepted subset: values without `"` or `\` (writer fails closed on
// both). Generated secrets and the generated DATABASE_URL never contain them.
const acceptedValues = [
  "monitor",
  "",
  "Seacrest Petróleo",
  "abc#def",
  "it's",
  "  padded  ",
  "tab\tinside",
];

Deno.test("parseEnvFile round-trips the writer's accepted subset", () => {
  for (const value of acceptedValues) {
    const line = `KEY=${formatDotEnvValue(value)}`;
    assertEquals(parseEnvFile(line + "\n"), { KEY: value }, line);
  }
});

Deno.test("writer output reads identically in doctor and Deno --env-file", () => {
  for (const value of acceptedValues) {
    const line = `KEY=${formatDotEnvValue(value)}`;
    assertEquals(parseEnvFile(line + "\n"), { KEY: value }, line);
    assertEquals(denoEnvFileRead(line), value, line);
  }
});

Deno.test("writer contract fails closed on double quotes and backslashes", () => {
  const rejected = [
    'A "B" C',
    "back\\slash",
    "C:\\path\\to",
    "trailing\\",
    'say "hi"',
  ];
  for (const value of rejected) {
    let threw = "";
    try {
      formatDotEnvValue(value);
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }
    assertEquals(threw.length > 0, true, value);
  }
});

Deno.test("parseEnvFile handles comments, blanks, and quote styles", () => {
  const text = [
    "# comment",
    "",
    "PLAIN=monitor",
    "SPACED = spaced value ",
    'HASHED="abc#def"',
    "SINGLE='single'",
    'EMPTY=""',
    "  # indented comment",
    "no-equals-line",
  ].join("\n");
  assertEquals(parseEnvFile(text), {
    EMPTY: "",
    HASHED: "abc#def",
    PLAIN: "monitor",
    SINGLE: "single",
    SPACED: "spaced value",
  });
});

Deno.test("isMissingTable maps 42P01/undefined_table to warn-only", () => {
  const missing = [
    new Error('relation "users" does not exist'),
    new Error('relation "auth_flows" does not exist'),
    new Error("ERROR: relation users does not exist"),
    new Error("code 42P01: missing relation"),
    new Error("fatal: undefined_table reached"),
    'relation "barriers" does not exist',
    "42P01",
  ];
  for (const err of missing) {
    assertEquals(isMissingTable(err), true, String(err));
  }
});

Deno.test("isMissingTable keeps real failures as failures", () => {
  const real = [
    new Error('password authentication failed for user "barrier"'),
    new Error("connect timeout (8s)"),
    new Error("DATABASE_URL is not a parseable URL"),
    new Error(""),
    "some other error",
  ];
  for (const err of real) {
    assertEquals(isMissingTable(err), false, String(err));
  }
});
