// Export formats - the shared format keys, extensions and content types.
// This is why it exists: the toolbar menu, the browser builders and the
// /api/export route all name the same three formats, so one table keeps the
// key, the file extension and the served MIME type aligned everywhere.
export type Fmt = "csv" | "xlsx" | "html";

// Menu/route order: spreadsheet, report file, plain text.
export const FMT_ORDER: Fmt[] = ["xlsx", "html", "csv"];

export const FMT_EXT: Record<Fmt, string> = {
  csv: ".csv",
  xlsx: ".xlsx",
  html: ".html",
};

export const FMT_MIME: Record<Fmt, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // The report is a standalone landscape document the browser downloads as a
  // file (and prints from there); the server streams the same markup.
  html: "text/html;charset=utf-8",
};

// Keys an older open tab can still send. The spreadsheet used to be an HTML
// table named .xls and the report went through the print dialog as "pdf";
// both resolve to their current format instead of failing the request.
const LEGACY_FMT: Record<string, Fmt> = { xls: "xlsx", pdf: "html" };

// normalizeFmt: narrows untrusted input (query param, JSON body) to a known
// format, trimming and resolving the legacy keys.
export function normalizeFmt(v: unknown): Fmt | null {
  const key = typeof v === "string" ? v.trim() : "";
  if (key === "csv" || key === "xlsx" || key === "html") return key;
  return LEGACY_FMT[key] ?? null;
}
