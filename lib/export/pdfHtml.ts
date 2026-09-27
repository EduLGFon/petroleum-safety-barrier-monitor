// Print report HTML pieces - the landscape report as head/row/tail builders.
// This is why it exists: the browser mounts the report in the hidden print
// node while the server streams the same markup as the PDF print job, so
// both render identical pages. Inline styles only: the fragment is injected
// into the app page, where static/styles.css owns @page and the chrome rule.
import { CONF_COLORS, DISP_COLORS } from "../constants.ts";

import { escHtml, pill, ts } from "./html.ts";

import type { KpiStats } from "./summary.ts";

import type { Barrier } from "../types.ts";

import { EXPORT_HEADERS } from "./columns.ts";
import { daysSince, humanDuration } from "../utils.ts";
import { withBrand } from "../company.ts";

// Position of one export inside a multi-part print run. Single-part exports
// omit it, which keeps the report header exactly as it was.
export interface PrintPart {
  index: number;
  parts: number;
  total: number;
}

// printTableHead: the report header row, repeated by print CSS on every page.
function printTableHead(): string {
  return EXPORT_HEADERS.map((h) =>
    `<th style="background:#1E3A5F;color:#E2E8F0;font-size:8pt;padding:7px 5px;text-align:left;border-bottom:2pt solid #3B82F6;white-space:nowrap;">${
      escHtml(h)
    }</th>`
  ).join("");
}

function chip(label: string, value: string, bg: string, color: string) {
  return `<div style="flex:1;background:${bg};border-radius:8px;padding:8px 12px;">` +
    `<div style="font-size:7pt;color:#64748B;letter-spacing:.08em;">${
      escHtml(label.toUpperCase())
    }</div>` +
    `<div style="font-size:15pt;font-weight:bold;color:${color};">${
      escHtml(value)
    }</div></div>`;
}

// printDocOpen: banner, KPI chips and the table head. Close with
// printDocClose, and emit printRow per barrier in between.
export function printDocOpen(
  companyName: string,
  stats: KpiStats,
  part?: PrintPart,
): string {
  const eyebrow = companyName
    ? `<div style="font-size:10pt;letter-spacing:.18em;color:#93C5FD;">${
      escHtml(companyName.toUpperCase())
    }</div>`
    : "";
  const partLine = part && part.parts > 1
    ? `  |  parte ${part.index} de ${part.parts}`
    : "";
  return `<div style="font-family:'Inter Tight',Manrope,Inter,Helvetica,Arial,sans-serif;color:#0F172A;">` +
    `<div style="background:linear-gradient(135deg,#0A1628 0%,#1E3A5F 100%);color:#fff;padding:16px 18px 12px 18px;border-bottom:3px solid #3B82F6;">` +
    eyebrow +
    `<div style="font-size:16pt;font-weight:bold;margin-top:2px;">Monitor de Barreiras de Segurança</div>` +
    `<div style="font-size:9pt;color:#CBD5E1;margin-top:4px;">${
      escHtml(ts())
    }  |  ${stats.total} registros  ·  ${stats.pct} conformes${partLine}</div></div>` +
    `<div style="display:flex;gap:8px;margin:10px 0 2px 0;">` +
    chip("Total", stats.total, "#EFF6FF", "#1E3A5F") +
    chip(`Conformes · ${stats.pct}`, stats.compliant, "#ECFDF5", "#15803D") +
    chip("Não conformes", stats.nonCompliant, "#FEF2F2", "#B91C1C") +
    chip("Críticas NC", stats.critical, "#FFF7ED", "#C2410C") +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:6px;"><thead style="display:table-header-group;"><tr>${printTableHead()}</tr></thead><tbody>`;
}

export function printDocClose(companyName: string): string {
  return `</tbody></table>` +
    `<div style="font-size:7pt;color:#94A3B8;margin-top:10px;">${
      escHtml(withBrand(companyName, "Monitor de Barreiras"))
    } · gerado em ${escHtml(ts())}</div></div>`;
}

// printRow: one report row; the NC duration column is derived like the
// spreadsheet one so the two formats always agree.
export function printRow(b: Barrier, idx: number): string {
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
  const centered = (v: string) =>
    `<td style="font-size:7.5pt;padding:5px;border-bottom:1pt solid #E2E8F0;text-align:center;">${v}</td>`;
  return `<tr style="background:${bg};">` +
    cell(String(b.id), "text-align:right;color:#64748B;") +
    cell(b.tag, "font-family:Courier,monospace;font-weight:bold;") +
    cell(b.location) +
    cell(b.typology) +
    cell(b.category) +
    cell(b.grouping) +
    cell(b.criticality) +
    cell(b.owner || "Não informado") +
    centered(pill(b.availability, disp)) +
    cell(
      dur,
      dur === "-" ? "text-align:center;" : "color:#EA580C;font-style:italic;",
    ) +
    centered(pill(b.compliance, conf)) +
    cell(b.comments || "-") +
    cell(b.actionPlan || "-") +
    cell(b.origin || "-") +
    cell(b.externalCode || "-") +
    cell(b.locationName || "-") +
    cell(b.installLocal || "-") +
    cell(b.equipTypology || "-") +
    cell(b.fieldInstalled || "-") +
    cell(b.fieldOperational || "-") +
    cell(b.opStatus || "-") +
    cell(b.hasMaintPlan || "-") +
    cell(b.planFollowed || "-") +
    cell(b.failureFree || "-") +
    cell(b.maintStatus || "-") +
    cell(b.hasContingency || "-") +
    cell(b.contingencyDesc || "-") +
    cell(b.evidenceCode || "-") +
    cell(b.degradationDesc || "-") +
    cell(b.extraComments || "-") +
    `</tr>`;
}
