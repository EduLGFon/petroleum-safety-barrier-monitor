// Spreadsheet HTML pieces - the .xls report split into head/row/tail builders.
// This is why it exists: the browser joins these into one string while the
// server streams the very same markup for an 18k-row export, so both
// download files that agree cell for cell. One <table> is one worksheet, and
// wider exports are split at XLS_SHEET_ROWS so Excel accepts every sheet.
import { CONF_COLORS, CRIT_COLORS, DISP_COLORS } from "../constants.ts";
import { isCriticalRankLabel } from "../enums/codes.ts";
import type { KpiStats } from "./summary.ts";
import type { Barrier } from "../types.ts";
import { escHtml, pill, ts } from "./html.ts";
import { EXPORT_HEADERS } from "./columns.ts";
import { withBrand } from "../company.ts";

// Brand/KPI/footer rows span the whole table; derived so columns stay in sync.
export const XLS_SPAN = EXPORT_HEADERS.length;

// Approx width per character in points at 9pt, plus cell padding.
const PT_PER_CHAR = 5.5;
const CELL_PAD_PT = 12;
// Columns that may hold long free text wrap at this width instead of
// stretching the table.
const WRAP_COLS = new Set([11, 12, 16, 26, 28, 29]);
const MAX_WRAP_CHARS = 55;
const MIN_COL_PT = 40;
const MAX_COL_PT = 320;

// Column index of the non-conformance duration ("Sem Cont. há"), styled apart.
const DURATION_COL = 9;

// fitColWidths: one width per column so every cell fits, long free text
// capped to wrap. Callers pass a row sample (the first batch) instead of
// every row, which keeps streamed exports O(sample) instead of O(N).
export function fitColWidths(rows: string[][]): number[] {
  return EXPORT_HEADERS.map((h, ci) => {
    let max = h.length;
    for (const r of rows) max = Math.max(max, (r[ci] ?? "").length);
    if (WRAP_COLS.has(ci)) max = Math.min(max, MAX_WRAP_CHARS);
    return Math.min(
      MAX_COL_PT,
      Math.max(MIN_COL_PT, Math.round(max * PT_PER_CHAR + CELL_PAD_PT)),
    );
  });
}

export interface XlsSheetMeta {
  companyName: string;
  stats: KpiStats;
  widths: number[];
  // Worksheet position inside the file; 1 of 1 renders no sheet label.
  sheet: number;
  sheets: number;
}

// xlsDocOpen/xlsDocClose: the Excel HTML shell. Excel reads one worksheet per
// <table>, which is how XLS_SHEET_ROWS splitting maps onto the format.
export function xlsDocOpen(): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="UTF-8"></head><body>`;
}

export function xlsDocClose(): string {
  return `</body></html>`;
}

// xlsSheetOpen: table start with fitted colgroup, brand block, KPI strip and
// the column header row. Closed by xlsSheetClose.
export function xlsSheetOpen(meta: XlsSheetMeta): string {
  const { companyName, stats, widths, sheet, sheets } = meta;
  const brand = companyName.toUpperCase() ||
    "MONITOR DE BARREIRAS DE SEGURANÇA";
  const subtitle = `Exportado em ${ts()}  |  ${stats.total} registros`;
  const cols = widths.map((w) => `<col style="width:${w}pt;">`).join("");
  const head = EXPORT_HEADERS.map((h) =>
    `<th style="background:#1E3A5F;color:#fff;font-size:9pt;font-weight:bold;text-align:center;padding:6px 4px;white-space:normal;vertical-align:middle;border-bottom:2pt solid #3B82F6;">${
      escHtml(h)
    }</th>`
  ).join("");
  const kpiCell = (
    label: string,
    value: string,
    bg: string,
    color: string,
    span: number,
  ) =>
    `<td colspan="${span}" style="background:${bg};padding:7px 10px;vertical-align:middle;">` +
    `<div style="font-size:8pt;color:#64748B;letter-spacing:.06em;">${
      escHtml(label.toUpperCase())
    }</div>` +
    `<div style="font-size:13pt;font-weight:bold;color:${color};">${
      escHtml(value)
    }</div></td>`;
  const kpiStrip = `<tr>` +
    kpiCell("Total", stats.total, "#EFF6FF", "#1E3A5F", 4) +
    kpiCell(
      "Conformes",
      `${stats.compliant} · ${stats.pct}`,
      "#ECFDF5",
      "#15803D",
      3,
    ) +
    kpiCell("Não conformes", stats.nonCompliant, "#FEF2F2", "#B91C1C", 3) +
    kpiCell("Críticas NC", stats.critical, "#FFF7ED", "#C2410C", 3) +
    `</tr>`;
  const productRow = companyName
    ? `<tr><td colspan="${XLS_SPAN}" style="background:#0A1628;color:#93C5FD;font-size:10pt;letter-spacing:.14em;padding:0 12px 4px 12px;">MONITOR DE BARREIRAS DE SEGURANÇA</td></tr>`
    : "";
  const sheetRow = sheets > 1
    ? `<tr><td colspan="${XLS_SPAN}" style="background:#0E2036;color:#94A3B8;font-size:9pt;padding:5px 12px;white-space:normal;vertical-align:middle;">` +
      `Planilha ${sheet} de ${sheets}</td></tr>`
    : "";
  return `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:auto;font-family:Calibri,Arial,sans-serif;"><colgroup>${cols}</colgroup>` +
    `<tr><td colspan="${XLS_SPAN}" style="background:#0A1628;color:#fff;font-size:16pt;font-weight:bold;padding:12px 12px 2px 12px;white-space:normal;vertical-align:middle;">${
      escHtml(brand)
    }</td></tr>` +
    productRow +
    sheetRow +
    `<tr><td colspan="${XLS_SPAN}" style="background:#0E2036;color:#94A3B8;font-size:9pt;font-style:italic;padding:5px 12px;white-space:normal;vertical-align:middle;">${
      escHtml(subtitle)
    }</td></tr>` +
    `<tr><td colspan="${XLS_SPAN}" style="background:#3B82F6;font-size:2pt;padding:0;">&nbsp;</td></tr>` +
    kpiStrip +
    `<tr>${head}</tr>`;
}

// xlsSheetClose: ends the worksheet with the brand footer row.
export function xlsSheetClose(companyName: string): string {
  return `<tr><td colspan="${XLS_SPAN}" style="color:#94A3B8;font-size:8pt;font-style:italic;padding:6px 4px;">${
    escHtml(
      withBrand(companyName, "Gerado pelo Monitor de Barreiras de Segurança"),
    )
  }</td></tr></table>`;
}

// xlsRow: one styled data row. cells comes from row(b) so the spreadsheet
// shares the exact CSV cell mapping; idx only drives the zebra striping.
export function xlsRow(b: Barrier, idx: number, cells: string[]): string {
  const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
  const disp = DISP_COLORS[String(b.availability)]?.solid ?? "#64748b";
  const conf = CONF_COLORS[String(b.compliance)]?.solid ?? "#64748b";
  const isCrit = isCriticalRankLabel(String(b.criticality));
  const tds = cells.map((v, ci) => {
    const base =
      "font-size:9pt;color:#1E293B;padding:3px 5px;white-space:normal;word-wrap:break-word;vertical-align:top;border:1pt solid #E2E8F0;";
    if (ci === 0) {
      return `<td style="${base}text-align:right;color:#64748B;">${
        escHtml(v)
      }</td>`;
    }
    if (ci === 1) {
      return `<td style="${base}font-family:'Courier New';font-size:8pt;font-weight:bold;color:#1D4ED8;">${
        escHtml(v)
      }</td>`;
    }
    if (ci === 8) return `<td style="${base}text-align:center;">${pill(v, disp)}</td>`;
    if (ci === 10) return `<td style="${base}text-align:center;">${pill(v, conf)}</td>`;
    if (ci === 6) {
      const c = CRIT_COLORS[String(b.criticality)]?.solid ?? "#64748B";
      const extra = isCrit ? `background:${c}1F;font-weight:bold;` : "";
      return `<td style="${base}text-align:center;color:${c};${extra}">${
        escHtml(v)
      }</td>`;
    }
    if (ci === DURATION_COL && v) {
      return `<td style="${base}font-style:italic;color:#EA580C;">${
        escHtml(v)
      }</td>`;
    }
    return `<td style="${base}">${escHtml(v)}</td>`;
  }).join("");
  return `<tr style="background:${bg};">${tds}</tr>`;
}

// xlsSummary: the trailing indicator table (same rows as the CSV RESUMO
// block), so the spreadsheet carries the reconciling totals too.
export function xlsSummary(rows: Array<[string, string]>, companyName: string) {
  const body = rows.map(([k, v], i) => {
    const hl = k === "% Conformidade";
    const bg = hl ? "#EFF6FF" : i % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    return `<tr style="background:${bg};"><td style="font-size:10pt;padding:4px 10px;white-space:normal;vertical-align:top;${
      hl ? "font-weight:bold;color:#1E3A5F;" : ""
    }">${
      escHtml(k)
    }</td><td style="font-size:10pt;font-weight:bold;text-align:right;padding:4px 10px;${
      hl ? "color:#1D4ED8;font-size:11pt;" : ""
    }">${escHtml(v)}</td></tr>`;
  }).join("");
  return `<h3 style="font-family:Calibri,Arial,sans-serif;color:#0A1628;">${
    escHtml(withBrand(companyName, "Resumo Monitor de Barreiras"))
  }</h3>` +
    `<table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;"><tr><th style="background:#1E3A5F;color:#fff;padding:5px 12px;text-align:left;border-bottom:2pt solid #3B82F6;">Indicador</th><th style="background:#1E3A5F;color:#fff;padding:5px 12px;text-align:right;border-bottom:2pt solid #3B82F6;">Qtd.</th></tr>${body}</table>`;
}
