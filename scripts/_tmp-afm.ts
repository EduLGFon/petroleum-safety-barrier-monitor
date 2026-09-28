// Temporary generator - dumps base-14 Helvetica AFM widths via pdf-lib.
// Run once with: deno run -A scripts/_tmp-afm.ts > metrics dump.
// Deleted after use; the checked-in table in lib/export/pdf/metrics.ts is
// the artifact. Not part of the test/check surface.
import { PDFDocument, StandardFonts } from "pdf-lib";

// WinAnsi bytes 0x80-0x9F are printable extras, not the C1 controls: the
// Unicode char that encodes to each byte.
const EXTRAS: Array<[string, number]> = [
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
];

const doc = await PDFDocument.create();
const regular = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const mono = await doc.embedFont(StandardFonts.CourierBold);

function width(
  // deno-lint-ignore no-explicit-any
  font: any,
  ch: string,
): number {
  return Math.round(font.widthOfTextAtSize(ch, 1000));
}

// Spot-checks against Adobe AFM values this author knows by heart.
const KNOWN: Array<[string, number, number]> = [
  [" ", 278, 278],
  ["0", 556, 556],
  ["A", 667, 722],
  ["a", 556, 556],
  ["É", 667, 667],
  ["ç", 500, 556],
];
for (const [ch, r, b] of KNOWN) {
  const wr = width(regular, ch);
  const wb = width(bold, ch);
  if (wr !== r || wb !== b) {
    throw new Error(`AFM mismatch for ${ch}: ${wr}/${wb} != ${r}/${b}`);
  }
}
// Courier must be fixed-pitch 600 everywhere, or the hardcoded 600 is wrong.
for (let byte = 0x20; byte <= 0xff; byte++) {
  if (byte === 0x7f) continue; // DEL has no WinAnsi glyph.
  if (byte >= 0x80 && byte <= 0x9f) continue;
  const w = width(mono, String.fromCharCode(byte));
  if (w !== 600) throw new Error(`Courier not fixed at ${byte}: ${w}`);
}
for (const [ch] of EXTRAS) {
  const w = width(mono, ch);
  if (w !== 600) throw new Error(`Courier not fixed for ${ch}: ${w}`);
}

function dump(
  // deno-lint-ignore no-explicit-any
  font: any,
  name: string,
): void {
  const entries: string[] = [];
  const push = (byte: number, ch: string) =>
    entries.push(`${byte}: ${width(font, ch)}`);
  // 0x7F (DEL) has no WinAnsi glyph; the encoder maps it to "?" anyway.
  for (let byte = 0x20; byte <= 0x7e; byte++) {
    push(byte, String.fromCharCode(byte));
  }
  push(0xa0, " ");
  for (const [ch, byte] of EXTRAS) push(byte, ch);
  for (let byte = 0xa1; byte <= 0xff; byte++) {
    push(byte, String.fromCharCode(byte));
  }
  console.log(`// ${name}: WinAnsi byte -> advance width in AFM units.`);
  console.log(`const ${name}: Record<number, number> = {`);
  for (let i = 0; i < entries.length; i += 8) {
    console.log(`  ${entries.slice(i, i + 8).join(", ")},`);
  }
  console.log(`};`);
  console.log(`console.log(Object.keys(${name}).length);`);
}

dump(regular, "HELV");
dump(bold, "HELV_BOLD");
