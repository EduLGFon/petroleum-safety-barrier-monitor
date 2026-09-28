// Unit tests for the PDF writer - framing, offsets and content.
// The parser below reads the bytes the way a reader does (header, startxref,
// xref entries, inflated streams), so a broken offset or stream fails here
// rather than in a PDF viewer.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
  type Bytes,
  ContentBuilder,
  deflatePage,
  hexToRgb,
  pdfChunks,
  pdfText,
} from "./writer.ts";

async function bytesOf(
  chunks: AsyncIterable<Bytes>,
): Promise<Bytes> {
  const parts: Bytes[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// bytesToLatin: byte-exact decode of binary output. TextDecoder "latin1" is
// really windows-1252 and remaps 0x80-0x9F, which corrupts deflated payloads.
function bytesToLatin(bin: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bin.length; i += 0x8000) {
    out += String.fromCharCode(...bin.subarray(i, i + 0x8000));
  }
  return out;
}

export interface ParsedPdf {
  bytes: Bytes;
  pageCount: number;
  texts: string[];
}

// readPdf: minimal validation - header, startxref pointing at "xref", every
// xref offset landing on "N 0 obj", every stream inflating - then every Tj/TJ
// string decoded as WinAnsi in encounter order. Exported for document_test,
// which asserts report content through the same reader.
export async function readPdf(bin: Bytes): Promise<ParsedPdf> {
  const raw = bytesToLatin(bin);
  assert(raw.startsWith("%PDF-1.4"), "missing PDF header");
  assert(raw.trimEnd().endsWith("%%EOF"), "missing EOF marker");
  const startxref = raw.lastIndexOf("startxref");
  assert(startxref !== -1);
  const xrefAt = Number(raw.slice(startxref).split(/\s+/)[1]);
  assert(raw.slice(xrefAt, xrefAt + 4) === "xref", "startxref is wrong");
  const xrefLines = raw.slice(xrefAt).split("\n");
  const [zero, sizeText] = xrefLines[1]!.split(" ");
  assertStrictEquals(zero, "0");
  const count = Number(sizeText);
  const entries = xrefLines.slice(2, 2 + count);
  assertStrictEquals(entries.length, count);
  assert(entries[0]!.endsWith("f "), "head entry must be free");
  const pages: number[] = [];
  for (let n = 1; n < count; n++) {
    const at = Number(entries[n]!.slice(0, 10));
    assert(
      raw.slice(at, at + `${n} 0 obj`.length) === `${n} 0 obj`,
      `object ${n} offset is wrong`,
    );
    const end = raw.indexOf("endobj", at);
    assert(end !== -1, `object ${n} never ends`);
    const body = raw.slice(at, end);
    if (/\/Type \/Page( |$)/.test(body)) {
      pages.push(n);
    }
  }
  // Page count from the /Pages object must match the /Page objects found.
  const pagesObj = raw.match(/\/Type \/Pages \/Kids \[(.*?)\] \/Count (\d+)/);
  assert(pagesObj, "missing Pages object");
  assertStrictEquals(Number(pagesObj[2]), pages.length);
  assertStrictEquals(pagesObj[1]!.trim().split(" ").length / 3, pages.length);
  // No URIs, actions or scripts anywhere: the file cannot phone home.
  assert(!/\/URI/i.test(raw), "file links out");
  assert(!/\/JS/i.test(raw), "file carries JavaScript");
  // Inflate every FlateDecode stream and collect the literal strings.
  const texts: string[] = [];
  const winAnsi = (code: number): string => {
    if (code === 0x3f) return "?";
    return String.fromCharCode(code);
  };
  for (
    const m of raw.matchAll(
      /\/Filter \/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\nendstream/g,
    )
  ) {
    const chunk = new Uint8Array(
      [...m[1]!].map((c) => c.charCodeAt(0) & 0xff),
    );
    const ds = new DecompressionStream("deflate");
    const w = ds.writable.getWriter();
    void w.write(chunk);
    void w.close();
    const inflated = await new Response(ds.readable).arrayBuffer();
    const text = bytesToLatin(new Uint8Array(inflated));
    // Balanced text objects keep readers from misparsing the stream.
    // Operators match as whole tokens: data words can contain "BT"/"ET".
    const boundary = String.raw`(?:^|[\s[\]<>])`;
    const edge = String.raw`(?=[\s[\]<>]|$)`;
    const bt = text.match(new RegExp(`${boundary}BT${edge}`, "g")) ?? [];
    const et = text.match(new RegExp(`${boundary}ET${edge}`, "g")) ?? [];
    assertStrictEquals(bt.length, et.length, "unbalanced BT/ET");
    for (const s of text.matchAll(/\((?:\\.|[^\\()])*\) Tj/g)) {
      let out = "";
      const inner = s[0]!.slice(1, -4);
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i]!;
        if (c === "\\" && i + 1 < inner.length) {
          out += inner[++i]!;
        } else {
          out += winAnsi(c.charCodeAt(0));
        }
      }
      texts.push(out);
    }
  }
  return { bytes: bin, pageCount: pages.length, texts };
}

Deno.test("hexToRgb parses hex and falls back without throwing", () => {
  assertEquals(hexToRgb("#22c55e"), {
    r: 0x22 / 255,
    g: 0xc5 / 255,
    b: 0x5e / 255,
  });
  assertEquals(hexToRgb("FF1E3A5F"), {
    r: 0x1e / 255,
    g: 0x3a / 255,
    b: 0x5f / 255,
  });
  assertEquals(hexToRgb("nope"), hexToRgb("#64748b"));
});

Deno.test("pdfText escapes parens and backslashes", () => {
  const latin = new TextDecoder("latin1");
  assertEquals(
    latin.decode(new Uint8Array(pdfText(`a(b)\\c`))),
    `(a\\(b\\)\\\\c)`,
  );
  assertEquals(latin.decode(new Uint8Array(pdfText("ãç"))), `(ãç)`);
});

Deno.test("pdfChunks writes pages a reader accepts", async () => {
  const first = new ContentBuilder()
    .filledRect(10, 10, 100, 20, { r: 0, g: 0, b: 0 })
    .text("Olá PSV-001 (ãç)", 10, 30, "F1", 10, { r: 1, g: 1, b: 1 });
  const second = new ContentBuilder()
    .text("Segunda página", 10, 30, "F2", 10, { r: 0, g: 0, b: 0 });
  async function* pages(): AsyncGenerator<Bytes> {
    yield first.bytes();
    yield second.bytes();
  }
  const bin = await bytesOf(
    pdfChunks(pages(), { title: "barreiras", author: "ACME" }),
  );
  const pdf = await readPdf(bin);
  assertStrictEquals(pdf.pageCount, 2);
  assertEquals(pdf.texts, ["Olá PSV-001 (ãç)", "Segunda página"]);
});

Deno.test("deflatePage round-trips through zlib", async () => {
  const raw = new TextEncoder().encode("BT (oi) Tj ET\n".repeat(100));
  const deflated = await deflatePage(raw);
  assert(deflated.length < raw.length / 4);
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  void w.write(deflated);
  void w.close();
  const back = await new Response(ds.readable).arrayBuffer();
  assertEquals(new Uint8Array(back), raw);
});
