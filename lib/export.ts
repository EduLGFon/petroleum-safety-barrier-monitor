// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser exports. The spreadsheet
// is an HTML table saved as .xls (opens in Excel/LibreOffice) with brand
// header, KPI strip, styled columns and a summary table. PDF prints a
// dedicated landscape report (never the whole page). CSV uses ; with BOM.
import { CONF_COLORS, DISP_COLORS } from "./constants.ts";
import type { Barrier } from "./types.ts";
import { withBrand } from "./company.ts";
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

// Rounded status pill: tinted background with bold colored text. Renders
// in Excel HTML, LibreOffice and print alike (radius ignored where
// unsupported, tint always shows).
function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:1px 9px;border-radius:999px;background:${color}1F;color:${color};font-weight:bold;">${
    escHtml(text)
  }</span>`;
}

interface KpiStats {
  total: string;
  conformes: string;
  naoConformes: string;
  pct: string;
  criticas: string;
}

function kpiStats(barriers: Barrier[]): KpiStats {
  const n = (xs: Barrier[]) => xs.length.toLocaleString("pt-BR");
  const conformes = barriers.filter((b) => b.conformidade === "Conforme");
  const criticas = barriers.filter((b) =>
    b.conformidade === "Não Conforme" && b.criticidade === "Crítica"
  );
  const pct = barriers.length > 0
    ? `${Math.round(conformes.length / barriers.length * 100)}%`
    : "0%";
  return {
    total: n(barriers),
    conformes: n(conformes),
    naoConformes: n(
      barriers.filter((b) => b.conformidade === "Não Conforme"),
    ),
    pct,
    criticas: n(criticas),
  };
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
  const s = kpiStats(barriers);
  const count = (fn: (b: Barrier) => boolean) =>
    barriers.filter(fn).length.toLocaleString("pt-BR");
  return [
    ["Total", s.total],
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
    ["Conformes", s.conformes],
    ["Não Conformes", s.naoConformes],
    ["Críticas NC", s.criticas],
    ["% Conformidade", s.pct],
  ];
}

// ── Spreadsheet (.xls as HTML table) ───────────────────────────────────────

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

// ── PDF (dedicated landscape print report) ─────────────────────────────────
// Builds a report-only DOM node, hides the app with print CSS (see
// static/styles.css) and opens the print dialog so the user saves a PDF.

const REPORT_ID = "print-report";

export function buildPrintReport(
  barriers: Barrier[],
  companyName = "",
): string {
  const stats = kpiStats(barriers);
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
      `<th style="background:#1E3A5F;color:#E2E8F0;font-size:8pt;padding:7px 5px;text-align:left;border-bottom:2pt solid #3B82F6;white-space:nowrap;">${
        escHtml(h)
      }</th>`
    ).join("");
  const chip = (label: string, value: string, bg: string, color: string) =>
    `<div style="flex:1;background:${bg};border-radius:8px;padding:8px 12px;">` +
    `<div style="font-size:7pt;color:#64748B;letter-spacing:.08em;">${
      escHtml(label.toUpperCase())
    }</div>` +
    `<div style="font-size:15pt;font-weight:bold;color:${color};">${
      escHtml(value)
    }</div></div>`;
  const chips = `<div style="display:flex;gap:8px;margin:10px 0 2px 0;">` +
    chip("Total", stats.total, "#EFF6FF", "#1E3A5F") +
    chip(`Conformes · ${stats.pct}`, stats.conformes, "#ECFDF5", "#15803D") +
    chip("Não conformes", stats.naoConformes, "#FEF2F2", "#B91C1C") +
    chip("Críticas NC", stats.criticas, "#FFF7ED", "#C2410C") +
    `</div>`;
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.disponibilidade)]?.solid ?? "#94a3b8";
    const conf = CONF_COLORS[String(b.conformidade)]?.solid ?? "#94a3b8";
    const dur = b.conformidade === "Não Conforme" && b.statusSince
      ? humanDuration(daysSince(b.statusSince))
      : "—";
    const cell = (v: string, style = "") =>
      `<td style="font-size:7.5pt;padding:5px;color:#0F172A;border-bottom:1pt solid #E2E8F0;vertical-align:top;${style}">${
        escHtml(v)
      }</td>`;
    return `<tr style="background:${bg};">` +
      cell(String(b.id), "text-align:right;color:#64748B;") +
      cell(b.tag, "font-family:Courier,monospace;font-weight:bold;") +
      cell(b.instalacao) +
      cell(b.categoria) +
      cell(b.criticidade) +
      `<td style="font-size:7.5pt;padding:5px;border-bottom:1pt solid #E2E8F0;text-align:center;">${
        pill(b.disponibilidade, disp)
      }</td>` +
      cell(
        dur,
        dur === "—" ? "text-align:center;" : "color:#EA580C;font-style:italic;",
      ) +
      `<td style="font-size:7.5pt;padding:5px;border-bottom:1pt solid #E2E8F0;text-align:center;">${
        pill(b.conformidade, conf)
      }</td>` +
      cell(b.planoAcao || "—") +
      `</tr>`;
  }).join("");
  const eyebrow = companyName
    ? `<div style="font-size:10pt;letter-spacing:.18em;color:#93C5FD;">${
      escHtml(companyName.toUpperCase())
    }</div>`
    : "";
  return `<div style="font-family:'Inter Tight',Manrope,Inter,Helvetica,Arial,sans-serif;color:#0F172A;">` +
    `<div style="background:linear-gradient(135deg,#0A1628 0%,#1E3A5F 100%);color:#fff;padding:16px 18px 12px 18px;border-bottom:3px solid #3B82F6;">` +
    eyebrow +
    `<div style="font-size:16pt;font-weight:bold;margin-top:2px;">Monitor de Barreiras de Segurança</div>` +
    `<div style="font-size:9pt;color:#CBD5E1;margin-top:4px;">${
      escHtml(ts())
    }  |  ${stats.total} registros  ·  ${stats.pct} conformes</div></div>` +
    chips +
    `<table style="width:100%;border-collapse:collapse;margin-top:6px;"><thead style="display:table-header-group;"><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `<div style="font-size:7pt;color:#94A3B8;margin-top:10px;">${
      escHtml(withBrand(companyName, "Monitor de Barreiras"))
    } · gerado em ${escHtml(ts())}</div></div>`;
}

export function exportToPDF(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): void {
  assertBrowser();
  let node = document.getElementById(REPORT_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = REPORT_ID;
    document.body.appendChild(node);
  }
  node.innerHTML = buildPrintReport(barriers, companyName);
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
// Plain-text format: no styling applies. Headers and pt-BR formatting only.

export function exportToCSV(
  barriers: Barrier[],
  filename = "barreiras",
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
