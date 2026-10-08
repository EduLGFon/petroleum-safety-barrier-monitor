// Server CSV export - same rows and summary as the client exports.
// This is why it exists: /api/export must produce byte-identical content to
// the dashboard CSV download, so both go through row() (30-column mapping),
// csvCell (quoting) and the same RESUMO rows. Only the transport differs:
// here a ReadableStream of database batches instead of a browser Blob.
import { CSV_HEADERS, csvCell } from "../export/csv.ts";

import type { Barrier, KpiSnapshot } from "../types.ts";

import { summaryRowsFrom } from "../export/summary.ts";

import { textStream } from "./exportStream.ts";

import { row } from "../export/rows.ts";

// streamExportCsv: BOM + header, then the data rows (one chunk per batch),
// then the RESUMO block. The summary comes from the scope aggregate, so it
// reconciles with the streamed rows even on a 200k-row export.
export function streamExportCsv(
  batches: AsyncIterable<Barrier[]>,
  kpi: KpiSnapshot,
): ReadableStream<Uint8Array> {
  return textStream(batches, {
    head: () => ["\uFEFF" + CSV_HEADERS.map(csvCell).join(";") + "\r\n"],
    render: (batch) =>
      batch.map((b) => row(b).map(csvCell).join(";") + "\r\n").join(""),
    tail: () => {
      let out = "\r\nRESUMO\r\n";
      for (const [label, value] of summaryRowsFrom(kpi)) {
        out += `${csvCell(label)};${csvCell(value)}\r\n`;
      }
      return [out];
    },
  });
}

// streamToText: drains a stream (tests and any future non-HTTP sink).
export async function streamToText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    merged.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(merged);
}
