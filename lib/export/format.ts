// Export formats - the shared format keys, extensions and content types.
// This is why it exists: the toolbar menu, the browser builders and the
// /api/export route all name the same three formats, so one table keeps the
// key, the file extension and the served MIME type aligned everywhere.
export type Fmt = "csv" | "xlsx" | "pdf";

// Menu/route order: spreadsheet, print report, plain text.
export const FMT_ORDER: Fmt[] = ["xlsx", "pdf", "csv"];

export const FMT_EXT: Record<Fmt, string> = {
  csv: ".csv",
  xlsx: ".xlsx",
  pdf: ".pdf",
};

export const FMT_MIME: Record<Fmt, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // The PDF format is a print job: the server streams the report markup the
  // print dialog consumes, not a binary PDF.
  pdf: "text/html;charset=utf-8",
};

// Keys an older open tab can still send. The spreadsheet used to be an HTML
// table named .xls; it is now a real .xlsx, so the old key maps onto it
// instead of failing the request.
const LEGACY_FMT: Record<string, Fmt> = { xls: "xlsx" };

// normalizeFmt: narrows untrusted input (query param, JSON body) to a known
// format, trimming and resolving the legacy spreadsheet key.
export function normalizeFmt(v: unknown): Fmt | null {
  const key = typeof v === "string" ? v.trim() : "";
  if (key === "csv" || key === "xlsx" || key === "pdf") return key;
  return LEGACY_FMT[key] ?? null;
}
