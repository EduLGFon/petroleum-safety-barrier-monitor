// Print part sizing - how many print jobs an export is split into.
// This is why it exists: the browser print flow and the /api/export route
// must agree on the split, otherwise the caller would ask for a part the
// route numbered differently (a skipped or repeated PDF page range).
import { PDF_PART_ROWS } from "./limits.ts";

// pdfPartCount: at least one part, so an empty scope still prints a header
// instead of opening no dialog at all.
export function pdfPartCount(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / PDF_PART_ROWS));
}
