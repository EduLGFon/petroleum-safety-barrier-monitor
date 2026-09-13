// Server CSV export - same rows and summary as the client exports.
// This is why it exists: GET /api/export must produce byte-identical content
// to the dashboard's CSV download, so both go through row() (14-column
// mapping), csvCell (quoting) and summaryRows (RESUMO block). Only the
// transport differs: here a ReadableStream instead of a browser Blob.
import { CSV_HEADERS, csvCell } from "../export/csv.ts";
import { row } from "../export/rows.ts";
import { summaryRows } from "../export/summary.ts";
import type { Barrier } from "../types.ts";

// EXPORT_MAX_ROWS: hard cap on one export. listBarriers allows far larger
// pages, but a CSV beyond this is a report job, not a download - the route
// answers 400 naming the filtered total so the caller refines the query.
export const EXPORT_MAX_ROWS = 10_000;

// Chunk size per stream enqueue: bounded memory no matter the export size.
const CHUNK_ROWS = 500;

// streamExportCsv: BOM + header, then data rows in chunks, then a RESUMO
// block from summaryRows(). The data-row count always equals barriers.length,
// so the route's X-Export-Total header and the file agree by construction.
export function streamExportCsv(
  barriers: Barrier[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const summary = summaryRows(barriers);
  let stage: "head" | "rows" | "summary" | "done" = "head";
  let idx = 0;

  return new ReadableStream<Uint8Array>({
    // NOTE: every pull must enqueue or close. This runtime never re-invokes
    // pull after an empty one, so the zero-barrier case falls through to the
    // summary inside the SAME pull instead of returning without progress
    // (which would stall the stream forever).
    pull(controller) {
      for (;;) {
        if (stage === "head") {
          controller.enqueue(
            encoder.encode(
              "\uFEFF" + CSV_HEADERS.map(csvCell).join(";") + "\r\n",
            ),
          );
          stage = "rows";
          return;
        }
        if (stage === "rows") {
          const end = Math.min(idx + CHUNK_ROWS, barriers.length);
          if (end === idx) {
            stage = "summary";
            continue;
          }
          let chunk = "";
          for (; idx < end; idx++) {
            chunk += row(barriers[idx]!).map(csvCell).join(";") + "\r\n";
          }
          controller.enqueue(encoder.encode(chunk));
          if (idx >= barriers.length) stage = "summary";
          return;
        }
        let out = "\r\nRESUMO\r\n";
        for (const [label, value] of summary) {
          out += `${csvCell(label)};${csvCell(value)}\r\n`;
        }
        controller.enqueue(encoder.encode(out));
        stage = "done";
        controller.close();
        return;
      }
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
