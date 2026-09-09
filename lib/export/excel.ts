// Spreadsheet export - barriers as .xls (HTML table for Excel/LibreOffice).
// This is why it exists: zero-dependency spreadsheet with brand header, KPI
// strip, auto-fitted columns, styled rows, and a summary table.
import { assertBrowser, download, escHtml, pill, ts } from "./html.ts";
import { CONF_COLORS, DISP_COLORS } from "../constants.ts";
import { kpiStats, summaryRows } from "./summary.ts";
import { withBrand } from "../company.ts";
import type { Barrier } from "../types.ts";
import { row } from "./rows.ts";

const HEADERS = [
  "#",
  "TAG",
  "Inst.",
  "Tipologia",
  "Localização",
  "Categoria",
  "Agrupamento",
  "Criticidade",
  "Dono",
  "Disponibilidade",
  "Sem Conting. há",
  "Conformidade",
  "Comentários",
  "Plano de Ação",
];

// Approx width per character in points at 9pt, plus cell padding.
const PT_PER_CHAR = 5.5;
const CELL_PAD_PT = 12;
// Columns that may hold long free text wrap at this width instead of
// stretching the table.
const WRAP_COLS = new Set([4, 12, 13]);
const MAX_WRAP_CHARS = 55;
const MIN_COL_PT = 40;
const MAX_COL_PT = 320;

// Measures content and returns one width per column so every cell fits.
// Long free-text columns are capped and wrap onto multiple lines.
function fitColWidths(headers: string[], rows: string[][]): number[] {
  return headers.map((h, ci) => {
    let max = h.length;
    for (const r of rows) max = Math.max(max, (r[ci] ?? "").length);
    if (WRAP_COLS.has(ci)) max = Math.min(max, MAX_WRAP_CHARS);
    return Math.min(
      MAX_COL_PT,
      Math.max(MIN_COL_PT, Math.round(max * PT_PER_CHAR + CELL_PAD_PT)),
    );
  });
}

// Exports barriers as .xls (HTML table) with brand header, KPI strip, styled
// columns, and summary table; browser-only.
export function exportToExcel(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): void {
  assertBrowser();
  const brand = companyName.toUpperCase() ||
    "MONITOR DE BARREIRAS DE SEGURANÇA";
  const stats = kpiStats(barriers);
  const subtitle = `Exportado em ${ts()}  |  ${stats.total} registros`;
  const data = barriers.map(row);
  const widths = fitColWidths(HEADERS, data);
  const cols = widths.map((w) => `<col style="width:${w}pt;">`).join("");
  const head = HEADERS.map((h) =>
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
      `${stats.conformes} · ${stats.pct}`,
      "#ECFDF5",
      "#15803D",
      4,
    ) +
    kpiCell("Não conformes", stats.naoConformes, "#FEF2F2", "#B91C1C", 3) +
    kpiCell("Críticas NC", stats.criticas, "#FFF7ED", "#C2410C", 3) +
    `</tr>`;
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.disponibilidade)]?.solid ?? "#64748b";
    const conf = CONF_COLORS[String(b.conformidade)]?.solid ?? "#64748b";
    const isCrit = b.criticidade === "Crítica";
    const cells = data[idx].map((v, ci) => {
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
      if (ci === 9) {
        return `<td style="${base}text-align:center;">${pill(v, disp)}</td>`;
      }
      if (ci === 11) {
        return `<td style="${base}text-align:center;">${pill(v, conf)}</td>`;
      }
      if (ci === 7) {
        const c = isCrit ? "#F97316" : "#64748B";
        const extra = isCrit ? `background:${c}1F;font-weight:bold;` : "";
        return `<td style="${base}text-align:center;color:${c};${extra}">${
          escHtml(v)
        }</td>`;
      }
      if (ci === 10 && v) {
        return `<td style="${base}font-style:italic;color:#EA580C;">${
          escHtml(v)
        }</td>`;
      }
      return `<td style="${base}">${escHtml(v)}</td>`;
    }).join("");
    return `<tr style="background:${bg};">${cells}</tr>`;
  }).join("");
  const summary = summaryRows(barriers).map(([k, v], i) => {
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
  const productRow = companyName
    ? `<tr><td colspan="14" style="background:#0A1628;color:#93C5FD;font-size:10pt;letter-spacing:.14em;padding:0 12px 4px 12px;">MONITOR DE BARREIRAS DE SEGURANÇA</td></tr>`
    : "";
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>` +
    `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:auto;font-family:Calibri,Arial,sans-serif;"><colgroup>${cols}</colgroup>` +
    `<tr><td colspan="14" style="background:#0A1628;color:#fff;font-size:16pt;font-weight:bold;padding:12px 12px 2px 12px;white-space:normal;vertical-align:middle;">${
      escHtml(brand)
    }</td></tr>` +
    productRow +
    `<tr><td colspan="14" style="background:#0E2036;color:#94A3B8;font-size:9pt;font-style:italic;padding:5px 12px;white-space:normal;vertical-align:middle;">${
      escHtml(subtitle)
    }</td></tr>` +
    `<tr><td colspan="14" style="background:#3B82F6;font-size:2pt;padding:0;">&nbsp;</td></tr>` +
    kpiStrip +
    `<tr>${head}</tr>${body}` +
    `<tr><td colspan="14" style="color:#94A3B8;font-size:8pt;font-style:italic;padding:6px 4px;">${
      escHtml(
        withBrand(companyName, "Gerado pelo Monitor de Barreiras de Segurança"),
      )
    }</td></tr></table>` +
    `<h3 style="font-family:Calibri,Arial,sans-serif;color:#0A1628;">${
      escHtml(withBrand(companyName, "Resumo Monitor de Barreiras"))
    }</h3>` +
    `<table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;"><tr><th style="background:#1E3A5F;color:#fff;padding:5px 12px;text-align:left;border-bottom:2pt solid #3B82F6;">Indicador</th><th style="background:#1E3A5F;color:#fff;padding:5px 12px;text-align:right;border-bottom:2pt solid #3B82F6;">Qtd.</th></tr>${summary}</table>` +
    `</body></html>`;
  download(
    new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" }),
    `${filename}.xls`,
  );
}
