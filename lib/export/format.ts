// Export formats - the shared format keys, extensions and content types.
// This is why it exists: the toolbar menu, the browser builders and the
// /api/export route all name the same three formats, so one table keeps the
// key, the file extension and the served MIME type aligned everywhere.
export type Fmt = "csv" | "xls" | "pdf";

// Menu/route order: spreadsheet, print report, plain text.
export const FMT_ORDER: Fmt[] = ["xls", "pdf", "csv"];

export const FMT_EXT: Record<Fmt, string> = {
  csv: ".csv",
  xls: ".xls",
  pdf: ".pdf",
};

export const FMT_MIME: Record<Fmt, string> = {
  csv: "text/csv;charset=utf-8",
  xls: "application/vnd.ms-excel",
  // The PDF format is a print job: the server streams the report markup the
  // print dialog consumes, not a binary PDF.
  pdf: "text/html;charset=utf-8",
};

// Narrows untrusted input (query param, JSON body) to a known format.
export function isFmt(v: unknown): v is Fmt {
  return v === "csv" || v === "xls" || v === "pdf";
}
