// Client export helpers - download barriers as spreadsheet, PDF or CSV.
// This is why it exists: zero-dependency browser exports. The spreadsheet
// is an HTML table saved as .xls (opens in Excel/LibreOffice), PDF uses
// the browser print dialog (save as PDF), CSV is manual with BOM.
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
  "Localizacao",
  "Categoria",
  "Agrupamento",
  "Criticidade",
  "Dono",
  "Disponibilidade",
  "Sem Conting. ha",
  "Conformidade",
  "Comentarios",
  "Plano de Acao",
];

// ── Spreadsheet (.xls as HTML table) ───────────────────────────────────────

export function exportToExcel(
  barriers: Barrier[],
  filename = "seacrest-barreiras",
): void {
  assertBrowser();
  const title =
    `SEACREST PETROLEO - Monitor de Barreiras de Seguranca (${ts()} | ${
      barriers.length.toLocaleString("pt-BR")
    } registros)`;
  const head = HEADERS.map((h) =>
    `<th style="background:#1E3A5F;color:#fff;">${escHtml(h)}</th>`
  ).join("");
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.disponibilidade)]?.solid ?? "#64748b";
    const conf = CONF_COLORS[String(b.conformidade)]?.solid ?? "#64748b";
    const cells = row(b).map((v, ci) => {
      let style = "";
      if (ci === 9) style = `color:${disp};font-weight:bold;`;
      if (ci === 11) style = `color:${conf};font-weight:bold;`;
      return `<td style="${style}">${escHtml(v)}</td>`;
    }).join("");
    return `<tr style="background:${bg};">${cells}</tr>`;
  }).join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><h2>${
      escHtml(title)
    }</h2><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  download(
    new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" }),
    `${filename}.xls`,
  );
}

// ── PDF (browser print dialog, save as PDF) ────────────────────────────────

export function exportToPDF(
  barriers: Barrier[],
  _filename = "seacrest-barreiras",
): void {
  assertBrowser();
  void barriers;
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
    "Instalacao",
    "Tipologia",
    "Localizacao",
    "Categoria",
    "Agrupamento",
    "Criticidade",
    "Dono",
    "Disponibilidade",
    "Sem Cont. ha",
    "Conformidade",
    "Comentarios",
    "Plano de Acao",
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
