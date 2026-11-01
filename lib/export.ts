// Client export entry - types and constants only (no builder values).
// This is why it exists: the format builders (xlsx/pdf/csv, ~2.5k lines)
// load lazily via dynamic import() at the export click (see ExportMenu),
// so importing values from here would drag them into the dashboard bundle.
// Import builders directly from ./export/xlsx.ts, ./export/pdf.ts or
// ./export/csv.ts inside an async handler instead.
export { FMT_EXT, FMT_MIME, FMT_ORDER } from "./export/format.ts";

export { EXPORT_MAX_ROWS } from "./export/limits.ts";

export type { Fmt } from "./export/format.ts";
