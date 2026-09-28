// Server spreadsheet export - streams the .xlsx workbook of the whole scope.
// This is why it exists: the browser can only hold a page of rows, so the
// 18k-row workbook is generated here from database batches and streamed out.
// The builder is the same one the browser download uses (lib/export/xlsx/), so
// both files agree cell for cell, and the ZIP container is written as the
// rows arrive, so nothing bigger than one batch is ever resident.
import type { KpiSnapshot } from "../types.ts";
import { xlsxChunks } from "../export/xlsx/workbook.ts";
import type { Bytes } from "../export/xlsx/zip.ts";

import type { Barrier } from "../types.ts";

export interface XlsxMeta {
  companyName: string;
  // Scope aggregate, so the KPI strip and the summary sheet reconcile with the
  // dashboard without buffering every row just to count them.
  kpi: KpiSnapshot;
}

// streamExportXlsx: the workbook as a byte stream, deflated entry by entry.
// Cancelling the response stops the generator, which releases the database
// cursor with it.
export function streamExportXlsx(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsxMeta,
): ReadableStream<Bytes> {
  const chunks = xlsxChunks(batches, meta);
  return new ReadableStream<Bytes>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await chunks.return?.(undefined);
    },
  });
}
