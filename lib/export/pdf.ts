// PDF download - the browser side of the PDF export.
// This is why it exists: client mode holds the whole filtered selection in
// memory, so the file is assembled by the same builder the server streams
// (lib/export/pdf/document.ts) and handed to the browser as a Blob. Real PDF
// bytes, so the file opens in any reader with no extension warning, stays
// crisp at any zoom, and carries no page URL.
import { EXPORT_MAX_ROWS, refusalMessage } from "./limits.ts";

import { buildPdfDocument } from "./pdf/document.ts";

import { assertBrowser, download } from "./html.ts";

import { FMT_EXT, FMT_MIME } from "./format.ts";

import type { Barrier } from "../types.ts";

// exportToPDF: downloads the report for the whole selection; browser-only.
// Refuses beyond EXPORT_MAX_ROWS with an actionable error (the server path
// serves bigger exports from streamed database batches).
export function exportToPDF(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): Promise<void> {
  assertBrowser();
  if (barriers.length > EXPORT_MAX_ROWS) {
    throw new Error(refusalMessage("PDF", barriers.length));
  }
  return (async () => {
    const bytes = await buildPdfDocument(barriers, {
      companyName,
      title: filename,
    });
    download(
      new Blob([bytes], { type: FMT_MIME.pdf }),
      `${filename}${FMT_EXT.pdf}`,
    );
  })();
}
