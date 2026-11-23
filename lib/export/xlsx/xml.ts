// xlsx XML primitives - escaping, cell references and cell/row markup.
// Why it exists: every part of the workbook is hand-built XML, so escaping and
// reference building live here once. Values come from the database, so the
// escaper also drops characters XML 1.0 cannot represent (a stray control
// byte in a comment would otherwise make Excel reject the whole file).
const encoder = new TextEncoder();

// XML 1.0 allows only #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
// [#x10000-#x10FFFF]. Everything else is invalid: the C0 controls except
// tab/newline/carriage return, U+FFFE/U+FFFF, and any unpaired surrogate
// (a lone half of a pair has no character at all). The C1 block
// (#x7F-#x9F) is legal in XML 1.0 but stripped as well: Excel's reader is
// stricter than the specification and rejects the whole workbook over it.
// The `u` flag is what makes the surrogate class match only *unpaired*
// halves: a well-formed pair is one astral code point and survives.
// The lint rule is right in general and wrong here: matching them by code is
// the whole point, and a database comment carrying one would make Excel
// reject the entire workbook.
const ILLEGAL_XML =
  // deno-lint-ignore no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]|[\uD800-\uDFFF]/gu;

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

// XLSX_CELL_MAX_CHARS: Excel's hard limit for the text of one cell
// (32.767 characters). A longer value - a runaway comment - makes Excel
// reject the workbook with a repair prompt, so the cell text is cut here,
// before escaping. The cut can split a surrogate pair; the escaper then
// drops the orphaned half, which is exactly the right outcome.
export const XLSX_CELL_MAX_CHARS = 32_767;

// inlineStr: a text cell. Inline strings (instead of a shared-string table)
// keep the writer single-pass: no second table to collect and re-emit.
export function inlineStr(
  ref: string,
  value: string,
  style?: number,
): string {
  const text = value.length > XLSX_CELL_MAX_CHARS
    ? value.slice(0, XLSX_CELL_MAX_CHARS)
    : value;
  return `<c r="${ref}"${
    styleAttr(style)
  } t="inlineStr"><is><t xml:space="preserve">${escXml(text)}</t></is></c>`;
}

// numberCell: a numeric cell, so Excel sorts and filters it as a number.
// Non-finite values (NaN/Infinity from bad data) are not valid in <v> and
// would corrupt the sheet, so they fall back to an inline string cell.
export function numberCell(
  ref: string,
  value: number,
  style?: number,
): string {
  if (!Number.isFinite(value)) return inlineStr(ref, String(value), style);
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
