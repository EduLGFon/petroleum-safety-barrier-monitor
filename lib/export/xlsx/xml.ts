// xlsx XML primitives - escaping, cell references and cell/row markup.
// Why it exists: every part of the workbook is hand-built XML, so escaping and
// reference building live here once. Values come from the database, so the
// escaper also drops characters XML 1.0 cannot represent (a stray control
// byte in a comment would otherwise make Excel reject the whole file).
const encoder = new TextEncoder();

// XML 1.0 forbids the C0 controls except tab, newline and carriage return.
// The lint rule is right in general and wrong here: matching them by code is
// the whole point, and a database comment carrying one would make Excel
// reject the entire workbook.
// deno-lint-ignore no-control-regex
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

// escXml: escapes markup and removes characters XML 1.0 cannot carry.
export function escXml(v: string): string {
  return v
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// colName: 1-based column index to spreadsheet letters (1 = A, 27 = AA).
export function colName(index: number): string {
  let n = Math.max(1, Math.floor(index));
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// cellRef: "B7" style reference for a 1-based column and row.
export function cellRef(col: number, row: number): string {
  return `${colName(col)}${row}`;
}

// styleAttr: the s="N" part of a cell, omitted for the default style.
function styleAttr(style: number | undefined): string {
  return style === undefined || style === 0 ? "" : ` s="${style}"`;
}

// inlineStr: a text cell. Inline strings (instead of a shared-string table)
// keep the writer single-pass: no second table to collect and re-emit.
export function inlineStr(
  ref: string,
  value: string,
  style?: number,
): string {
  return `<c r="${ref}"${
    styleAttr(style)
  } t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
}

// numberCell: a numeric cell, so Excel sorts and filters it as a number.
export function numberCell(
  ref: string,
  value: number,
  style?: number,
): string {
  return `<c r="${ref}"${styleAttr(style)}><v>${value}</v></c>`;
}

// blankCell: an empty but styled cell (keeps fills and borders on gaps in the
// brand block and the KPI strip).
export function blankCell(ref: string, style: number): string {
  return `<c r="${ref}" s="${style}"/>`;
}

// rowXml: one <row> with the given cells; height sets an explicit row height.
export function rowXml(
  n: number,
  cells: string,
  height?: number,
): string {
  const attrs = height
    ? ` r="${n}" ht="${height}" customHeight="1"`
    : ` r="${n}"`;
  return `<row${attrs}>${cells}</row>`;
}

// xmlDoc: the prolog every part starts with.
export function xmlDoc(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
}

// utf8: encodes a part for the ZIP writer.
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(s);
}
