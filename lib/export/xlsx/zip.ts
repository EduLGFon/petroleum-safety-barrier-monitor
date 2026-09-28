// xlsx zip writer - streams a ZIP container with deflated, CRC-checked entries.
// Why it exists: an .xlsx is a ZIP of XML parts. The export can carry 200k
// rows, so the container has to be written as the database yields batches:
// each entry declares its size in a trailing data descriptor, which lets the
// deflate output be piped straight out while the CRC and sizes are still
// unknown. Fixed timestamps keep the bytes reproducible (same rows in, same
// file out, which the tests rely on).
const LOCAL_SIG = 0x04034b50;
const DESCRIPTOR_SIG = 0x08074b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const METHOD_DEFLATE = 8;
const FLAG_UTF8 = 0x0800;
const FLAG_DESCRIPTOR = 0x0008;
// 1980-01-01 00:00 in DOS date/time: the zip epoch, so a fixed stamp.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

// Bytes: a chunk backed by a plain ArrayBuffer. Stream writers only accept
// that (not a SharedArrayBuffer-backed view), so the whole writer speaks it.
export type Bytes = Uint8Array<ArrayBuffer>;

// CRC-32 table (IEEE), built once on first use.
let table: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return table = t;
}

// crc32Update: running CRC-32 over a chunk, seeded with the previous value
// (pass 0 for the first chunk). Returns the next seed; the final value is
// `seed ^ 0xffffffff`.
export function crc32Update(seed: number, bytes: Uint8Array): number {
  const t = crcTable();
  let c = seed ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = t[(c ^ bytes[i]) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// One part of the workbook: a path inside the package plus its bytes, either
// already in memory (the small static parts) or streamed (the data sheet).
export interface ZipEntry {
  name: string;
  chunks: Iterable<Bytes> | AsyncIterable<Bytes>;
}

interface CentralRecord {
  name: Bytes;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
}

// little-endian writers; a DataView per field would be far noisier.
function u16(n: number): Bytes {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n: number): Bytes {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
}
function cat(parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const encoder = new TextEncoder();
const bytes = (s: string): Bytes => encoder.encode(s);

// Deflates an async chunk source, yielding compressed pieces as they are
// produced. The source is fed by a separate task because a TransformStream
// only drains when its readable side is being read.
async function* deflate(
  source: Iterable<Bytes> | AsyncIterable<Bytes>,
  onRaw: (chunk: Bytes) => void,
): AsyncGenerator<Bytes> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  const feed = (async () => {
    for await (const chunk of source) {
      onRaw(chunk);
      await writer.write(chunk);
    }
    await writer.close();
  })();
  const reader = cs.readable.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
  await feed;
}

// writeZip: local headers + deflated data + data descriptors per entry, then
// the central directory and end-of-central-directory record. Sizes and CRCs
// are known by the time the central directory is written, which is exactly
// why the local headers can stream ahead with placeholder sizes.
export async function* writeZip(
  entries: AsyncIterable<ZipEntry>,
): AsyncGenerator<Bytes> {
  const central: CentralRecord[] = [];
  let offset = 0;
  for await (const entry of entries) {
    const name = bytes(entry.name);
    const local = cat([
      u32(LOCAL_SIG),
      u16(20), // version needed: 2.0 (deflate)
      u16(FLAG_UTF8 | FLAG_DESCRIPTOR),
      u16(METHOD_DEFLATE),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(0), // crc, in the data descriptor
      u32(0), // compressed size, in the data descriptor
      u32(0), // uncompressed size, in the data descriptor
      u16(name.length),
      u16(0), // extra field length
      name,
    ]);
    yield local;
    let crc = 0;
    let usize = 0;
    let csize = 0;
    for await (
      const piece of deflate(entry.chunks, (raw) => {
        crc = crc32Update(crc, raw);
        usize += raw.length;
      })
    ) {
      csize += piece.length;
      yield piece;
    }
    const descriptor = cat([
      u32(DESCRIPTOR_SIG),
      u32(crc),
      u32(csize),
      u32(usize),
    ]);
    yield descriptor;
    central.push({ name, crc, csize, usize, offset });
    offset += local.length + csize + descriptor.length;
  }
  const records = central.map((c) =>
    cat([
      u32(CENTRAL_SIG),
      u16(20), // version made by
      u16(20), // version needed
      u16(FLAG_UTF8 | FLAG_DESCRIPTOR),
      u16(METHOD_DEFLATE),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(c.crc),
      u32(c.csize),
      u32(c.usize),
      u16(c.name.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk number
      u16(0), // internal attributes
      u32(0), // external attributes
      u32(c.offset),
      c.name,
    ])
  );
  const directory = cat(records);
  const eocd = cat([
    u32(EOCD_SIG),
    u16(0), // this disk
    u16(0), // disk with the central directory
    u16(central.length),
    u16(central.length),
    u32(directory.length),
    u32(offset),
    u16(0), // archive comment length
  ]);
  yield directory;
  yield eocd;
}

// bytesOf: drains a chunk stream into one array (browser downloads and tests
// want the finished file; the server hands the generator to a ReadableStream).
export async function bytesOf(
  chunks: AsyncIterable<Bytes>,
): Promise<Bytes> {
  const out: Bytes[] = [];
  for await (const chunk of chunks) out.push(chunk);
  return cat(out);
}
