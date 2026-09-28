// Spreadsheet download - the browser side of the .xlsx export.
// This is why it exists: mock/client mode has the whole filtered selection in
// memory, so the file is assembled by the same builder the server streams
// (lib/export/xlsx/workbook.ts) and handed to the browser as a Blob. Real
// OOXML, so Excel opens it natively: no extension warning, no HTML import
// pass, and a crisp grid at any zoom level.
import { EXPORT_MAX_ROWS, refusalMessage } from "./limits.ts";
import { FMT_EXT, FMT_MIME } from "./format.ts";
import { assertBrowser, download } from "./html.ts";
import { xlsxBytes } from "./xlsx/workbook.ts";

import { batchesOf } from "./batches.ts";

import { computeKpi } from "../utils.ts";

import type { Barrier } from "../types.ts";

// One batch, so the browser path streams exactly like the server path.
const BATCH = 5_000;

// exportToXlsx: downloads the spreadsheet for the whole selection; browser
// only. Refuses beyond EXPORT_MAX_ROWS with an actionable error (the server
// path serves bigger exports from streamed database batches).
export function exportToXlsx(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): Promise<void> {
  assertBrowser();
  if (barriers.length > EXPORT_MAX_ROWS) {
    throw new Error(refusalMessage("Excel", barriers.length));
  }
  return (async () => {
    const bytes = await xlsxBytes(batchesOf(barriers, BATCH), {
      companyName,
      kpi: computeKpi(barriers),
    });
    download(
      // xlsx is UTF-8 by definition, so no BOM is needed here.
      new Blob([bytes], { type: FMT_MIME.xlsx }),
      `${filename}${FMT_EXT.xlsx}`,
    );
  })();
}
