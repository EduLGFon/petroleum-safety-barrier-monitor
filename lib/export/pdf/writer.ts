// PDF writer - minimal PDF 1.4 bytes with a trailing xref table.
// Why it exists: the report must download as real PDF bytes, but a 200k-row
// export can never materialize in memory, so pages stream out one at a time
// exactly like the ZIP writer does: objects are emitted in file order with
// recorded offsets, and the xref table plus trailer close the file. Only
// base-14 fonts (never embedded) and FlateDecode content streams are used,
// which every reader supports. No URI, annotation or JavaScript object is
// ever emitted, so the file cannot carry a page URL.
import { encodeWinAnsi } from "./metrics.ts";

export type Bytes = Uint8Array<ArrayBuffer>;

// Base-14 font resources, always declared in this order so their object
// numbers are stable (3-6) whatever the page count.
export const PDF_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Courier-Bold",
] as const;

export type PdfFontRef = "F1" | "F2" | "F3" | "F4";

export interface PdfColor {
  r: number;
  g: number;
  b: number;
}

// hexToRgb: "#rrggbb" (or opaque "FFrrggbb") to 0-1 floats. Anything else
// falls back to neutral slate instead of breaking the content stream.
export function hexToRgb(color: string, fallback = "#64748b"): PdfColor {
  const hex = color.trim().replace(/^#/, "");
  const body = /^[0-9a-f]{8}$/i.test(hex) ? hex.slice(2) : hex;
  if (!/^[0-9a-f]{6}$/i.test(body)) return hexToRgb(fallback, "#000000");
  const n = (at: number) => parseInt(body.slice(at, at + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4) };
}

// num: trims floats to 2 decimals so coordinates stay short.
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// pdfText: one literal string, WinAnsi-encoded with ( ) \ escaped.
export function pdfText(text: string): number[] {
  const out: number[] = [0x28];
  for (const b of encodeWinAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c);
    out.push(b);
  }
  out.push(0x29);
  return out;
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

// ContentBuilder: accumulates one page's content stream as raw bytes.
// Coordinates are PDF-native (origin bottom-left, y up); layout.ts converts.
export class ContentBuilder {
  private ops: number[] = [];

  // filledRect: solid rectangle (cells, pills, banner, chips, rules).
  filledRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: PdfColor,
  ): this {
    const c = `${num(color.r)} ${num(color.g)} ${num(color.b)} rg`;
    this.ops.push(
      ...ascii(`${c} ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f\n`),
    );
    return this;
  }

  // text: one run in a resource font at an explicit baseline position.
  text(
    text: string,
    x: number,
    y: number,
    font: PdfFontRef,
    size: number,
    color: PdfColor,
  ): this {
    const c = `${num(color.r)} ${num(color.g)} ${num(color.b)} rg`;
    this.ops.push(...ascii(`BT /${font} ${num(size)} Tf ${c} 1 0 0 1 `));
    this.ops.push(...ascii(`${num(x)} ${num(y)} Tm `));
    this.ops.push(...pdfText(text));
    this.ops.push(...ascii(` Tj ET\n`));
    return this;
  }

  bytes(): Bytes {
    return new Uint8Array(this.ops);
  }
}

// deflatePage: zlib-compresses one page (PDF /FlateDecode is zlib, not raw
// deflate), keeping only one page resident at a time.
export async function deflatePage(raw: Bytes): Promise<Bytes> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const feed = writer.write(raw).then(() => writer.close());
  const reader = cs.readable.getReader();
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  await feed;
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Object numbers: catalog 1, fonts 2-5, pages object 6, then page/content
// pairs from 7 on, info last. Emission order is header, catalog, page pairs
// (offsets recorded as they stream), fonts, pages, info, xref - file order
// is free in PDF, only the xref must be exact.
const OBJ_CATALOG = 1;
const OBJ_FONTS = 2; // 2, 3, 4, 5
const OBJ_PAGES = 6;
const OBJ_FIRST_PAGE = 7;

export interface PdfMeta {
  title: string;
  author: string;
}

// pdfChunks: header, one page pair per yielded content stream, then fonts,
// pages, info and the xref table. Nothing larger than one page is ever held.
export async function* pdfChunks(
  pages: AsyncIterable<Bytes>,
  meta: PdfMeta,
): AsyncGenerator<Bytes> {
  const enc = new TextEncoder();
  const bytes = (s: string): Bytes => enc.encode(s);
  let offset = 0;
  // Object number -> file offset, recorded as each object streams out; the
  // xref table reads this map, so emission order never matters.
  const at = new Map<number, number>();
  const emit = function* (n: number, chunk: Bytes): Generator<Bytes> {
    at.set(n, offset);
    offset += chunk.length;
    yield chunk;
  };
  const obj = (n: number, body: Bytes): Bytes => {
    const head = bytes(`${n} 0 obj\n`);
    const tail = bytes(`\nendobj\n`);
    const out = new Uint8Array(head.length + body.length + tail.length);
    out.set(head, 0);
    out.set(body, head.length);
    out.set(tail, head.length + body.length);
    return out;
  };

  // The file header is not an object, so it only advances the offset.
  const header = bytes(`%PDF-1.4\n%\xe2\xe3\xcf\xd3\n`);
  offset += header.length;
  yield header;
  yield* emit(
    OBJ_CATALOG,
    obj(OBJ_CATALOG, bytes(`<< /Type /Catalog /Pages ${OBJ_PAGES} 0 R >>`)),
  );

  // Page pairs stream out; their numbers are preassigned from 7 on.
  const kids: number[] = [];
  let next = OBJ_FIRST_PAGE;
  let pageCount = 0;
  for await (const raw of pages) {
    const deflated = await deflatePage(raw);
    const pageNum = next;
    const contentNum = next + 1;
    kids.push(pageNum);
    next += 2;
    pageCount++;
    const resources = PDF_FONTS.map((_, i) => `/F${i + 1} ${OBJ_FONTS + i} 0 R`)
      .join(" ");
    yield* emit(
      pageNum,
      obj(
        pageNum,
        bytes(
          `<< /Type /Page /Parent ${OBJ_PAGES} 0 R ` +
            `/MediaBox [0 0 842 595] ` +
            `/Resources << /Font << ${resources} >> >> ` +
            `/Contents ${contentNum} 0 R >>`,
        ),
      ),
    );
    const streamHead = bytes(
      `<< /Length ${deflated.length} /Filter /FlateDecode >>\nstream\n`,
    );
    const streamTail = bytes(`\nendstream`);
    const full = new Uint8Array(
      streamHead.length + deflated.length + streamTail.length,
    );
    full.set(streamHead, 0);
    full.set(deflated, streamHead.length);
    full.set(streamTail, streamHead.length + deflated.length);
    yield* emit(contentNum, obj(contentNum, full));
  }

  for (let i = 0; i < PDF_FONTS.length; i++) {
    yield* emit(
      OBJ_FONTS + i,
      obj(
        OBJ_FONTS + i,
        bytes(
          `<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONTS[i]} ` +
            `/Encoding /WinAnsiEncoding >>`,
        ),
      ),
    );
  }
  yield* emit(
    OBJ_PAGES,
    obj(
      OBJ_PAGES,
      bytes(
        `<< /Type /Pages /Kids [${
          kids.map((k) => `${k} 0 R`).join(" ")
        }] /Count ${pageCount} >>`,
      ),
    ),
  );
  const infoNum = next;
  const stamp = (d: Date): string => {
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${
      p(d.getUTCDate())
    }` +
      `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${
        p(d.getUTCSeconds())
      }+00'00'`;
  };
  const info = new Uint8Array([
    ...ascii(`<< /Title `),
    ...pdfText(meta.title),
    ...ascii(` /Author `),
    ...pdfText(meta.author),
    ...ascii(` /Creator (Monitor de Barreiras de Seguranca) `),
    ...ascii(`/CreationDate (${stamp(new Date())}) >>`),
  ]);
  yield* emit(infoNum, obj(infoNum, info));

  // xref: one entry per object plus the free head entry; every offset was
  // recorded during emission, so a wrong offset fails here, not in a reader.
  const size = infoNum + 1;
  let xref = `xref\n0 ${size}\n`;
  xref += `0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) {
    xref += `${String(at.get(n) ?? -1).padStart(10, "0")} 00000 n \n`;
  }
  const xrefAt = offset;
  yield bytes(xref);
  offset += xref.length;
  const trailer =
    `trailer\n<< /Size ${size} /Root ${OBJ_CATALOG} 0 R /Info ${infoNum} 0 R >>\n` +
    `startxref\n${xrefAt}\n%%EOF`;
  yield bytes(trailer);
}
