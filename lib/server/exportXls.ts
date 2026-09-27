// Server spreadsheet export - streams the .xls report of the whole scope.
// This is why it exists: the browser can only hold a page of rows, so the
// 18k-row .xls is generated here from database batches and streamed out. The
// markup comes from excelHtml.ts, the same builders the browser download
// uses, so both files agree cell for cell.
import {
  fitColWidths,
  xlsDocClose,
  xlsDocOpen,
  xlsRow,
  xlsSheetClose,
  xlsSheetOpen,
  xlsSummary,
} from "../export/excelHtml.ts";
import { summaryRowsFrom, kpiStatsFrom } from "../export/summary.ts";
import { textStream } from "./exportStream.ts";
import { XLS_SHEET_ROWS } from "../export/limits.ts";
import type { Barrier, KpiSnapshot } from "../types.ts";
import { row } from "../export/rows.ts";

export interface XlsMeta {
  companyName: string;
  kpi: KpiSnapshot;
  sheets: number;
  // Rows per worksheet; defaults to Excel's hard limit. Injectable so the
  // split can be exercised without rendering 65k rows in a test.
  sheetRows?: number;
}

// streamExportXls: one <table> per worksheet, split at XLS_SHEET_ROWS because
// Excel refuses a longer sheet. Sheet breaks are emitted inline, so a 200k-row
// export never builds more than a batch of markup at a time.
export function streamExportXls(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsMeta,
): ReadableStream<Uint8Array> {
  const stats = kpiStatsFrom(meta.kpi);
  const summary = summaryRowsFrom(meta.kpi);
  const { companyName, sheets } = meta;
  const sheetRows = Math.max(1, meta.sheetRows ?? XLS_SHEET_ROWS);
  // Column widths are fitted from the first batch: streaming cannot wait for
  // every row, and one batch is enough to size the columns. An empty scope
  // falls back to header-only widths.
  let widths = fitColWidths([]);
  let sheet = 1;
  let inSheet = 0;
  const open = () =>
    xlsSheetOpen({ companyName, stats, widths, sheet, sheets });

  return textStream(batches, {
    // BOM first so Excel on Windows reads the file as pt-BR.
    head: (first) => {
      if (first.length > 0) widths = fitColWidths(first.map(row));
      return ["\uFEFF", xlsDocOpen(), open()];
    },
    render: (batch, offset) => {
      let out = "";
      for (let i = 0; i < batch.length; i++) {
        if (inSheet >= sheetRows) {
          out += xlsSheetClose(companyName);
          sheet++;
          inSheet = 0;
          out += open();
        }
        const b = batch[i];
        out += xlsRow(b, offset + i, row(b));
        inSheet++;
      }
      return out;
    },
    tail: () => [
      xlsSheetClose(companyName),
      xlsSummary(summary, companyName),
      xlsDocClose(),
    ],
  });
}
