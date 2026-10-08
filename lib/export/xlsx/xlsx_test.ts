// Unit tests for the xlsx primitives: zip framing, XML escaping/references,
// the style registry and the width fit. The zip cases run the real deflate
// path, so a broken data descriptor or CRC fails here rather than in Excel.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { alignmentOf, dataRow, sheetStyles } from "./dataSheet.ts";

import { colName, escXml, inlineStr, utf8 } from "./xml.ts";

import { bytesOf, crc32Update, writeZip } from "./zip.ts";

import { argb, styleBook, tint } from "./styles.ts";

import { EXPORT_HEADERS } from "../columns.ts";

import { xlsxColWidths } from "./widths.ts";

import { mkBarrier } from "../fixture.ts";

import type { Bytes } from "./zip.ts";

import { row } from "../rows.ts";

// Minimal ZIP reader for the assertions below: walks the central directory and
// inflates an entry, which is exactly what a spreadsheet application does.
function u16(v: DataView, at: number): number {
  return v.getUint16(at, true);
}
function u32(v: DataView, at: number): number {
  return v.getUint32(at, true);
}

interface ReadEntry {
  name: string;
  text: string;
}

async function readZip(bin: Bytes): Promise<ReadEntry[]> {
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  // End of central directory: scanned from the tail (no comment expected).
  let eocd = bin.length - 22;
  while (eocd >= 0 && u32(view, eocd) !== 0x06054b50) eocd--;
  assert(eocd >= 0, "missing end-of-central-directory record");
  const count = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);
  const out: ReadEntry[] = [];
  for (let i = 0; i < count; i++) {
    assertStrictEquals(
      u32(view, at),
      0x02014b50,
      "bad central header signature",
    );
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const localAt = u32(view, at + 42);
    const name = new TextDecoder().decode(
      bin.subarray(at + 46, at + 46 + nameLen),
    );
    // Local header: the name repeats, then the deflated payload.
    const localNameLen = u16(view, localAt + 26);
    const localExtraLen = u16(view, localAt + 28);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const crc = u32(view, at + 16);
    const csize = u32(view, at + 20);
    const usize = u32(view, at + 24);
    const raw = bin.subarray(dataAt, dataAt + csize);
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    void writer.write(raw);
    void writer.close();
    const text = new TextDecoder().decode(
      await new Response(ds.readable).arrayBuffer(),
    );
    assertStrictEquals(new TextEncoder().encode(text).length, usize, name);
    // Streaming CRC over the inflated bytes must match the stored value.
    let seed = 0;
    for (const byte of utf8(text)) {
      seed = crc32Update(seed, new Uint8Array([byte]));
    }
    assertStrictEquals(seed, crc, name);
    out.push({ name, text });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function* entries(...list: { name: string; data: string }[]) {
  for (const e of list) {
    yield { name: e.name, chunks: [utf8(e.data)] };
  }
}

Deno.test("writeZip streams a readable archive with matching CRCs", async () => {
  const big = "<row>conteúdo com acentuação</row>".repeat(500);
  const bin = await bytesOf(
    writeZip(
      entries(
        { name: "[Content_Types].xml", data: "<Types/>" },
        { name: "xl/worksheets/sheet1.xml", data: big },
      ),
    ),
  );
  // Local file header signature leads the file.
  assertStrictEquals(bin[0], 0x50);
  assertStrictEquals(bin[1], 0x4b);
  const read = await readZip(bin);
  assertEquals(read.map((e) => e.name), [
    "[Content_Types].xml",
    "xl/worksheets/sheet1.xml",
  ]);
  assertStrictEquals(read[1]!.text, big);
  // Deflate actually shrinks the repetitive payload.
  assert(bin.length < big.length / 4, `zip not compressed: ${bin.length}`);
});

Deno.test("writeZip handles an empty entry", async () => {
  const bin = await bytesOf(writeZip(entries({ name: "empty.xml", data: "" })));
  const read = await readZip(bin);
  assertStrictEquals(read[0]!.text, "");
});

Deno.test('crc32Update matches the known CRC-32 of "123456789"', () => {
  let seed = 0;
  for (const byte of utf8("123456789")) {
    seed = crc32Update(seed, new Uint8Array([byte]));
  }
  assertStrictEquals(seed, 0xcbf43926);
});

Deno.test("escXml escapes markup and drops illegal control bytes", () => {
  assertStrictEquals(
    escXml(`<a href="x">&'`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&apos;",
  );
  // Tab, newline and carriage return survive; other C0 controls do not.
  assertStrictEquals(escXml("a\tb\nc\rd"), "a\tb\nc\rd");
  assertStrictEquals(escXml("a\u0000b\u0008c\u001fd"), "abcd");
});

Deno.test("colName maps column indexes to spreadsheet letters", () => {
  assertStrictEquals(colName(1), "A");
  assertStrictEquals(colName(26), "Z");
  assertStrictEquals(colName(27), "AA");
  assertStrictEquals(colName(30), "AD");
});

Deno.test("inlineStr emits a self-contained text cell", () => {
  assertStrictEquals(
    inlineStr("B2", "PSV-001", 3),
    `<c r="B2" s="3" t="inlineStr"><is><t xml:space="preserve">PSV-001</t></is></c>`,
  );
  assertStrictEquals(inlineStr("A1", "x"), inlineStr("A1", "x", 0));
});

Deno.test("argb converts hex and falls back for anything else", () => {
  assertStrictEquals(argb("#22c55e"), "FF22C55E");
  assertStrictEquals(argb("22c55e"), "FF22C55E");
  assertStrictEquals(argb("#abc"), "FFAABBCC");
  assertStrictEquals(argb("#ff1e3a5f"), "FF1E3A5F");
  // The dynamic hsl() fallback colors are not valid ARGB.
  assertStrictEquals(argb("hsl(210 70% 55%)"), "FF64748B");
  assertStrictEquals(argb(""), "FF64748B");
  assertStrictEquals(argb("nope", "FFFFFFFF"), "FFFFFFFF");
});

Deno.test("tint blends the colour toward white, always opaque", () => {
  // Excel ignores fill alpha, so the blend must be opaque paint, never a
  // translucent wash: alpha is what hid the status text.
  assertStrictEquals(tint("#22c55e"), "FFE4F8EC");
  assertStrictEquals(tint("#000000", 0.5), "FF808080");
  assertStrictEquals(tint("#ffffff"), "FFFFFFFF");
  assertStrictEquals(tint("hsl(1 2% 3%)"), "FFECEEF1");
});

Deno.test("status fills stay opaque so the text never disappears", () => {
  const book = styleBook();
  const styles = sheetStyles(book);
  styles.availability("Disponível");
  styles.availability("Indisponível");
  styles.compliance("Não Conforme");
  styles.critical("ESO");
  styles.zebraCritical("D");
  const rgbs = [...book.xml().matchAll(/rgb="([0-9A-Fa-f]{8})"/g)]
    .map((m) => m[1]);
  assert(rgbs.length > 0);
  // Every paint in the file is fully opaque: a translucent fill renders as
  // the full-strength colour in Excel, exactly like the label on top of it.
  for (const rgb of rgbs) assert(rgb!.startsWith("FF"), rgb);
});

Deno.test("styleBook reuses styles and keeps Excel's reserved entries", () => {
  const book = styleBook();
  const plain = book.style({});
  assertStrictEquals(plain, 0); // cellXfs[0] is the default
  const header = book.style({
    font: { size: 9, bold: true, color: "FFFFFFFF" },
    fill: "FF1E3A5F",
    align: { horizontal: "center", vertical: "center", wrap: true },
    border: "FFCBD5E1",
  });
  assertStrictEquals(
    book.style({
      font: { size: 9, bold: true, color: "FFFFFFFF" },
      fill: "FF1E3A5F",
      align: { horizontal: "center", vertical: "center", wrap: true },
      border: "FFCBD5E1",
    }),
    header,
  );
  const crit = book.style({
    font: { size: 9, bold: true, color: "FFDC2626" },
    fill: "FFFDE8E8",
  });
  const xml = book.xml();
  // Three distinct xfs (default, header, critical) and the two reserved fills.
  assertStrictEquals(xml.includes(`<cellXfs count="3">`), true);
  assertStrictEquals(xml.includes(`<fills count="4">`), true);
  assertStrictEquals(xml.includes(`patternType="gray125"`), true);
  assertStrictEquals(xml.includes(`<fonts count="3">`), true);
  assertStrictEquals(xml.includes(`rgb="FFDC2626"`), true);
  assert(crit > 0);
});

Deno.test("alignmentOf centers short metadata, left-aligns free text", () => {
  for (
    const h of [
      "ID",
      "Instalação",
      "Tipologia",
      "Categoria",
      "Agrupamento",
      "Dono",
      "Origem",
      "Código Fracttal",
      "Nome Instalação",
      "Tipologia Equip.",
      "Elem. em Campo?",
      "Status Manut.",
      "Cód. Evidência",
      "Sem Cont. há",
      "Criticidade",
      "Disponibilidade",
      "Conformidade",
    ]
  ) {
    assertStrictEquals(alignmentOf(h), "center", h);
  }
  for (
    const h of [
      "TAG",
      "Comentários",
      "Plano de Ação",
      "Local Instalação",
      "Desc. Contingência",
      "Desc. Degradação",
      "Comentários 2",
    ]
  ) {
    assertStrictEquals(alignmentOf(h), "left", h);
  }
  // An unknown future column centers, which suits short metadata.
  assertStrictEquals(alignmentOf("Coluna Nova"), "center");
});

Deno.test("dataRow centers the metadata cells in the built sheet", () => {
  const book = styleBook();
  const styles = sheetStyles(book);
  const barrier = mkBarrier({ comments: "algum texto livre" });
  const xml = dataRow(barrier, row(barrier), 7, false, styles);
  // Cell reference -> style index, then the xf for that index.
  const styleOf = (ref: string): string => {
    const m = xml.match(new RegExp(`<c r="${ref}" s="(\\d+)"`));
    assert(m, ref);
    const xfs = [...book.xml().matchAll(/<xf [^>]*>.*?<\/xf>/g)]
      .map((x) => x[0]);
    return xfs[Number(m[1])] ?? "";
  };
  // Short metadata centers (ID, Instalação, Dono, duration, pills).
  for (const ref of ["A7", "C7", "H7", "J7", "G7", "I7", "K7"]) {
    assert(styleOf(ref).includes('horizontal="center"'), ref);
  }
  // TAG and free text stay left (no horizontal attribute at all).
  for (const ref of ["B7", "L7", "M7"]) {
    assert(!styleOf(ref).includes("horizontal="), ref);
  }
});

Deno.test("xlsxColWidths fits the content and caps free text", () => {
  const rows = [[
    "1",
    "PSV-001",
    "FAL",
    "Estação Coletora",
    "Válvula de Alívio de Pressão",
    "Sistemas de Alívio",
    "ESO",
    "Equipe de Manutenção",
    "Disponível",
    "",
    "Conforme",
    "x".repeat(400),
  ]];
  const widths = xlsxColWidths(rows);
  assertStrictEquals(widths.length, EXPORT_HEADERS.length);
  // Columns hug the longest content with a single-character margin.
  assertStrictEquals(widths[0], 6); // "ID": floor for short codes
  assertStrictEquals(widths[1], 8); // "PSV-001" + margin
  assertStrictEquals(widths[11], 27); // "Comentários": 26 + margin
  // Every width stays inside the readable band.
  assert(widths.every((w) => w >= 6 && w <= 60));
  // Header-only widths (empty export) still describe the sheet.
  const empty = xlsxColWidths([]);
  assert(empty.every((w) => w >= 6));
  assert(empty[4] > 6); // "Categoria" header
});
