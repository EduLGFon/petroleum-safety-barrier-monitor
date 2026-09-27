// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser exports. The spreadsheet
// is an HTML table saved as .xls (opens in Excel/LibreOffice) with brand
// header, KPI strip, styled columns and a summary table. PDF prints a
// dedicated landscape report (never the whole page), split into parts when
// the selection is bigger than one print job can lay out. CSV uses ; with
// BOM. Importers keep importing from here; formats live in small modules.
export { buildExcelHtml, exportToExcel } from "./export/excel.ts";
export { buildPrintReport, exportToPDF } from "./export/pdf.ts";
export { pdfPartTitle, printPdfParts, printReportPart } from "./export/pdf.ts";
export { exportToCSV } from "./export/csv.ts";
export { EXPORT_MAX_ROWS, PDF_PART_ROWS } from "./export/limits.ts";
export { FMT_EXT, FMT_MIME, FMT_ORDER } from "./export/format.ts";
export type { Fmt } from "./export/format.ts";
