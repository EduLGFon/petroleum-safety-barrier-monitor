// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser downloads, one per format,
// with no preview step in between. The spreadsheet is a real .xlsx workbook
// (OOXML) with a brand header, KPI strip, frozen header, styled columns and a
// summary sheet - built by the same builder the server streams, so both files
// agree cell for cell. The PDF is real PDF bytes (brand block, KPI chips, all
// 30 columns on A4 landscape, repeated header, footer) from the same builder
// the server streams. CSV uses ; with BOM. Importers keep importing from
// here; formats live in small modules.
export { exportToXlsx } from "./export/xlsx.ts";
export { exportToPDF } from "./export/pdf.ts";
export { exportToCSV } from "./export/csv.ts";
export { EXPORT_MAX_ROWS } from "./export/limits.ts";
export { FMT_EXT, FMT_MIME, FMT_ORDER } from "./export/format.ts";
export type { Fmt } from "./export/format.ts";
