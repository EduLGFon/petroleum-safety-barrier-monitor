// Unit tests for scripts/doctor.ts pure helpers (no DB needed).
// This is why it exists: doctor gates production setup, so its .env reader
// must round-trip exactly what Setup-Production.ps1 writes (writer escaping)
// and its missing-table mapping must stay warn-only on fresh databases
// (42P01/undefined_table) without masking real connection failures.
import { isMissingTable, parseEnvFile } from "./doctor.ts";

import { assertEquals } from "jsr:@std/assert@^1";

// formatDotEnvValue mirrors Format-DotEnvValue in
// deploy/windows/Setup-Production.ps1: quote on whitespace/#/quotes or
// leading/trailing space, escaping `\`->`\\` and `"`->`\"`. Kept in the test
// (not the reader) so a writer change breaks the round-trip here first.
function formatDotEnvValue(value: string): string {
  if (
    value === "" || /[\s#"']/.test(value) || /^\s/.test(value) ||
    /\s$/.test(value)
  ) {
    return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return value;
}

Deno.test("parseEnvFile round-trips writer-escaped values", () => {
  const values = [
    "monitor",
    "",
    "Seacrest Petróleo",
    "abc#def",
    'A "B" C',
    "back\\slash",
    'C:\\path\\to\\"quoted"',
    "trailing\\",
    "it's",
    "  padded  ",
    "tab\tinside",
  ];
  for (const value of values) {
    const line = `KEY=${formatDotEnvValue(value)}`;
    assertEquals(parseEnvFile(line + "\n"), { KEY: value }, line);
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
