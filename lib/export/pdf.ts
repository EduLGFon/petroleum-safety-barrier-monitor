// Print report export - landscape report DOM plus print-dialog flow for PDF.
// This is why it exists: printing the whole app page would leak chrome;
// a dedicated report node with print CSS (see static/styles.css) prints
// only the data table.
import { assertBrowser, escHtml, MAX_DOM_ROWS, pill, ts } from "./html.ts";

import { CONF_COLORS, DISP_COLORS } from "../constants.ts";

import { daysSince, humanDuration } from "../utils.ts";

import { refusalMessage } from "./limits.ts";

import type { Barrier } from "../types.ts";

import { withBrand } from "../company.ts";

import { kpiStats } from "./summary.ts";

const REPORT_ID = "print-report";

// Returns the landscape print-report HTML string (KPI chips + 11-col table); pure, no DOM side effects.
export function buildPrintReport(
  barriers: Barrier[],
  companyName = "",
): string {
  const stats = kpiStats(barriers);
  const head = [
    "#",
    "TAG",
    "Inst.",
    "Tipologia",
    "Categoria",
    "Criticidade",
    "Dono",
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
    chip(`Conformes · ${stats.pct}`, stats.compliant, "#ECFDF5", "#15803D") +
    chip("Não conformes", stats.nonCompliant, "#FEF2F2", "#B91C1C") +
    chip("Críticas NC", stats.critical, "#FFF7ED", "#C2410C") +
    `</div>`;
  const body = barriers.map((b, idx) => {
    const bg = idx % 2 === 0 ? "#F8FAFC" : "#FFFFFF";
    const disp = DISP_COLORS[String(b.availability)]?.solid ?? "#94a3b8";
    const conf = CONF_COLORS[String(b.compliance)]?.solid ?? "#94a3b8";
    const dur = b.compliance !== "Conforme" && b.statusSince
      ? humanDuration(daysSince(b.statusSince))
      : "-";
    const cell = (v: string, style = "") =>
      `<td style="font-size:7.5pt;padding:5px;color:#0F172A;border-bottom:1pt solid #E2E8F0;vertical-align:top;${style}">${
        escHtml(v)
      }</td>`;
    return `<tr style="background:${bg};">` +
      cell(String(b.id), "text-align:right;color:#64748B;") +
      cell(b.tag, "font-family:Courier,monospace;font-weight:bold;") +
      cell(b.location) +
      cell(b.typology) +
      cell(b.category) +
      cell(b.criticality) +
      cell(b.owner || "Não informado") +
      `<td style="font-size:7.5pt;padding:5px;border-bottom:1pt solid #E2E8F0;text-align:center;">${
        pill(b.availability, disp)
      }</td>` +
      cell(
        dur,
        dur === "-" ? "text-align:center;" : "color:#EA580C;font-style:italic;",
      ) +
      `<td style="font-size:7.5pt;padding:5px;border-bottom:1pt solid #E2E8F0;text-align:center;">${
        pill(b.compliance, conf)
      }</td>` +
      cell(b.actionPlan || "-") +
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

// Mounts/reuses the #print-report node, swaps title, prints, then clears on afterprint; browser-only.
// Refuses beyond MAX_DOM_ROWS with an actionable error (filter down or use
// CSV) instead of mounting tens of thousands of rows into the print DOM.
export function exportToPDF(
  barriers: Barrier[],
  filename = "barreiras",
  companyName = "",
): void {
  assertBrowser();
  if (barriers.length > MAX_DOM_ROWS) {
    throw new Error(refusalMessage("PDF", barriers.length));
  }
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
    if (node) node.innerHTML = "";
  };
  globalThis.addEventListener("afterprint", cleanup, { once: true });
  globalThis.print();
}
