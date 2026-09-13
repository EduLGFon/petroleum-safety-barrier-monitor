// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser exports. The spreadsheet
// is an HTML table saved as .xls (opens in Excel/LibreOffice) with brand
// header, KPI strip, styled columns and a summary table. PDF prints a
// dedicated landscape report (never the whole page). CSV uses ; with BOM.
// Importers keep importing from here; formats live in small modules.
export { buildPrintReport, exportToPDF } from "./export/pdf.ts";
export { exportToExcel } from "./export/excel.ts";
export { exportToCSV } from "./export/csv.ts";
