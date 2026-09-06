// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser exports. The spreadsheet
// is an HTML table saved as .xls (opens in Excel/LibreOffice) with brand
// header, styled columns and a summary table. PDF prints a dedicated
// landscape report (never the whole page). CSV uses ; with BOM.
import { CONF_COLORS, DISP_COLORS } from "./constants.ts";
import type { Barrier } from "./types.ts";
import { daysSince, fmtDate, humanDuration } from "./utils.ts";

function row(b: Barrier): string[] {
  const nc = b.conformidade === "Não Conforme";
  const when = nc && b.statusSince
    ? `${humanDuration(daysSince(b.statusSince))} (desde ${
      fmtDate(b.statusSince)
    })`
    : "";
  return [
    String(b.id),
    b.tag,
    b.instalacao,
    b.tipologia,
    b.locDesc,
    b.categoria,
    b.agrupamento,
    b.criticidade,
    b.dono || "Não informado",
    b.disponibilidade,
    when,
    b.conformidade,
    b.comentarios || "",
    b.planoAcao || "",
  ];
}

function ts(): string {
  return new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function assertBrowser(): void {
  if (typeof document === "undefined") {
    throw new Error("Exports run in the browser only.");
  }
}

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

function summaryRows(barriers: Barrier[]): Array<[string, string]> {
  const count = (fn: (b: Barrier) => boolean) =>
    barriers.filter(fn).length.toLocaleString("pt-BR");
  const conformes =
    barriers.filter((b) => b.conformidade === "Conforme").length;
  const pct = barriers.length > 0
    ? `${Math.round(conformes / barriers.length * 100)}%`
    : "0%";
  return [
    ["Total", barriers.length.toLocaleString("pt-BR")],
    ["Disponíveis", count((b) => b.disponibilidade === "Disponível")],
    [
      "Fora de Operação",
      count((b) => b.disponibilidade === "Fora de Operação"),
    ],
    [
      "Ind. Contingenciado",
      count((b) => b.disponibilidade === "Indisponível Contingenciado"),
    ],
    [
      "Degr. Contingenciado",
      count((b) => b.disponibilidade === "Degradado Contingenciado"),
    ],
    ["Degradado (NC)", count((b) => b.disponibilidade === "Degradado")],
    ["Indisponível (NC)", count((b) => b.disponibilidade === "Indisponível")],
    ["Conformes", conformes.toLocaleString("pt-BR")],
    ["Não Conformes", count((b) => b.conformidade === "Não Conforme")],
    ["% Conformidade", pct],
  ];
}

// ── Spreadsheet (.xls as HTML table) ───────────────────────────────────────

export function exportToExcel(
  barriers: Barrier[],
  filename = "seacrest-barreiras",
): void {
  assertBrowser();
  const subtitle = `Exportado em ${ts()}  |  ${
    barriers.length.toLocaleString("pt-BR")
  } registros`;
  const data = barriers.map(row);
  const widths = fitColWidths(HEADERS, data);
  const cols = widths.map((w) => `<col style="width:${w}pt;">`).join("");
  const head = HEADERS.map((h) =>
    `<th style="background:#1E3A5F;color:#fff;font-size:9pt;font-weight:bold;text-align:center;padding:5px 4px;white-space:normal;vertical-align:middle;">${
      escHtml(h)
    }</th>`
  ).join("");
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.disponibilidade)]?.solid ?? "#64748b";
    const conf = CONF_COLORS[String(b.conformidade)]?.solid ?? "#64748b";
    const isCrit = b.criticidade === "Crítica";
    const cells = data[idx].map((v, ci) => {
      let style =
        "font-size:9pt;color:#1E293B;padding:3px 4px;white-space:normal;word-wrap:break-word;vertical-align:top;";
      if (ci === 1) {
        style =
          "font-family:'Courier New';font-size:8pt;font-weight:bold;color:#1D4ED8;";
      }
      if (ci === 9) {
        style +=
          `background:${disp}22;color:${disp};font-weight:bold;text-align:center;`;
      }
      if (ci === 11) {
        style +=
          `background:${conf}1A;color:${conf};font-weight:bold;text-align:center;`;
      }
      if (ci === 7) {
        style += `text-align:center;font-weight:${
          isCrit ? "bold" : "normal"
        };color:${isCrit ? "#F97316" : "#64748B"};`;
      }
      if (ci === 10 && v) style += "font-style:italic;color:#EA580C;";
      return `<td style="${style}">${escHtml(v)}</td>`;
    }).join("");
    return `<tr style="background:${bg};">${cells}</tr>`;
  }).join("");
  const summary = summaryRows(barriers).map(([k, v]) =>
    `<tr><td style="font-size:10pt;padding:3px 8px;white-space:normal;vertical-align:top;">${
      escHtml(k)
    }</td><td style="font-size:10pt;padding:3px 8px;">${escHtml(v)}</td></tr>`
  ).join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>` +
    `<table border="1" style="border-collapse:collapse;table-layout:auto;"><colgroup>${cols}</colgroup>` +
    `<tr><td colspan="14" style="background:#0A1628;color:#fff;font-size:14pt;font-weight:bold;padding:8px;white-space:normal;vertical-align:middle;">SEACREST PETRÓLEO — Monitor de Barreiras de Segurança</td></tr>` +
    `<tr><td colspan="14" style="background:#0E2036;color:#94A3B8;font-size:9pt;font-style:italic;padding:5px 8px;white-space:normal;vertical-align:middle;">${
      escHtml(subtitle)
    }</td></tr>` +
    `<tr>${head}</tr>${body}</table>` +
    `<h3>SEACREST PETRÓLEO — Resumo Monitor de Barreiras</h3>` +
    `<table border="1" style="border-collapse:collapse;"><tr><th style="background:#1E3A5F;color:#fff;padding:4px 8px;">Indicador</th><th style="background:#1E3A5F;color:#fff;padding:4px 8px;">Qtd.</th></tr>${summary}</table>` +
    `</body></html>`;
  download(
    new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" }),
    `${filename}.xls`,
  );
}

// ── PDF (dedicated landscape print report) ─────────────────────────────────
// Builds a report-only DOM node, hides the app with print CSS (see
// static/styles.css) and opens the print dialog so the user saves a PDF.

const REPORT_ID = "print-report";

export function buildPrintReport(barriers: Barrier[]): string {
  const head = [
    "#",
    "TAG",
    "Inst.",
    "Categoria",
    "Criticidade",
    "Disponibilidade",
    "Sem Cont. há",
    "Conformidade",
    "Plano",
  ]
    .map((h) =>
      `<th style="background:#1E3A5F;color:#E2E8F0;font-size:8pt;padding:6px 5px;text-align:left;">${
        escHtml(h)
      }</th>`
    ).join("");
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.disponibilidade)]?.solid ?? "#94a3b8";
    const conf = CONF_COLORS[String(b.conformidade)]?.solid ?? "#94a3b8";
    const dur = b.conformidade === "Não Conforme" && b.statusSince
      ? humanDuration(daysSince(b.statusSince))
      : "—";
    const cell = (v: string, style = "") =>
      `<td style="font-size:7.5pt;padding:5px;color:#0F172A;${style}">${
        escHtml(v)
      }</td>`;
    return `<tr style="background:${bg};">` +
      cell(String(b.id)) +
      cell(b.tag, "font-family:Courier,monospace;") +
      cell(b.instalacao) +
      cell(b.categoria) +
      cell(b.criticidade) +
      cell(b.disponibilidade, `color:${disp};font-weight:bold;`) +
      cell(dur, dur === "—" ? "" : "color:#EA580C;") +
      cell(b.conformidade, `color:${conf};font-weight:bold;`) +
      cell(b.planoAcao || "—") +
      `</tr>`;
  }).join("");
  return `<div style="font-family:Inter,Helvetica,Arial,sans-serif;">` +
    `<div style="background:#0A1628;color:#fff;padding:14px 16px;border-bottom:2px solid #3B82F6;">` +
    `<div style="font-size:13pt;font-weight:bold;">SEACREST PETRÓLEO</div>` +
    `<div style="font-size:9pt;color:#94A3B8;">Monitor de Barreiras de Segurança</div>` +
    `<div style="font-size:9pt;color:#94A3B8;">${escHtml(ts())}  |  ${
      barriers.length.toLocaleString("pt-BR")
    } registros</div></div>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `<div style="font-size:7pt;color:#94A3B8;margin-top:10px;">Seacrest Petróleo · Monitor de Barreiras</div></div>`;
}

export function exportToPDF(
  barriers: Barrier[],
  filename = "seacrest-barreiras",
): void {
  assertBrowser();
  let node = document.getElementById(REPORT_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = REPORT_ID;
    document.body.appendChild(node);
  }
  node.innerHTML = buildPrintReport(barriers);
  const prevTitle = document.title;
  document.title = filename;
  document.body.classList.add("printing-report");
  const cleanup = () => {
    document.body.classList.remove("printing-report");
    document.title = prevTitle;
    node!.innerHTML = "";
  };
  globalThis.addEventListener("afterprint", cleanup, { once: true });
  globalThis.print();
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function exportToCSV(
  barriers: Barrier[],
  filename = "seacrest-barreiras",
): void {
  assertBrowser();
  const hdrs = [
    "ID",
    "TAG",
    "Instalação",
    "Tipologia",
    "Localização",
    "Categoria",
    "Agrupamento",
    "Criticidade",
    "Dono",
    "Disponibilidade",
    "Sem Cont. há",
    "Conformidade",
    "Comentários",
    "Plano de Ação",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    hdrs.map(esc).join(";"),
    ...barriers.map((b) => row(b).map(esc).join(";")),
  ].join("\r\n");
  download(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    `${filename}.csv`,
  );
}
