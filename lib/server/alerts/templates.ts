// Alert templates - the urgent digest subject and bodies, in repo (P5).
// This is why it exists: email copy is a reviewable artifact, not a string
// buried in the send path. Subjects stay ASCII-safe; every send ships a
// plain-text body plus a premium HTML part (multipart/alternative) with one
// card per barrier - critical first - in pt-BR.
import type { Urgency } from "../../dashboard/urgent.ts";

export interface DigestEvent {
  tag: string;
  location: string;
  availability: string;
  criticality: string;
  transitionDate: string;
  urgency: Urgency;
  // Rich detail (all optional - rows enqueued before enrichment still
  // render, showing only what is present):
  category?: string;
  typology?: string;
  grouping?: string;
  owner?: string;
  compliance?: string;
  locationName?: string;
  author?: string;
  note?: string;
  actionPlan?: string;
}

// urgentDigestSubject: counts in the subject so triage works from the inbox.
export function urgentDigestSubject(count: number, critical: number): string {
  const what = count === 1
    ? "1 barreira urgente"
    : `${count} barreiras urgentes`;
  const crit = critical > 0
    ? ` (${critical} crítica${critical > 1 ? "s" : ""})`
    : "";
  return `[Barreiras] ${what}${crit}`;
}

// immediateSubject: same counts as the digest, prefixed so inbox triage
// tells at-once mail apart from the periodic digest.
export function immediateSubject(count: number, critical: number): string {
  return `[Imediato] ${urgentDigestSubject(count, critical)}`;
}

// urgentDigestBody: plain-text fallback. First line per event keeps the
// legacy shape (flag + tag + location + status + date + criticality) so
// existing filters keep matching; detail lines follow when present.
export function urgentDigestBody(events: DigestEvent[], runAt: string): string {
  const lines: string[] = [
    "Novas barreiras em estado urgente detectadas pelo monitor:",
    "",
  ];
  for (const e of events) {
    const flag = e.urgency === "critical" ? "[CRÍTICA] " : "";
    lines.push(
      `• ${flag}${e.tag} (${e.location}) - ${e.availability} ` +
        `desde ${e.transitionDate} · criticidade ${e.criticality}`,
    );
    const context = [
      e.category ? `categoria ${e.category}` : "",
      e.typology ? `tipologia ${e.typology}` : "",
      e.locationName ? `local ${e.locationName}` : "",
      e.grouping ? `agrupamento ${e.grouping}` : "",
      e.owner ? `responsável ${e.owner}` : "",
      e.compliance ? `situação ${e.compliance}` : "",
    ].filter((s) => s !== "");
    if (context.length > 0) lines.push(`  ${context.join(" · ")}`);
    if (e.author) lines.push(`  Atualizado por: ${e.author}`);
    if (e.note) lines.push(`  Nota: ${e.note}`);
    if (e.actionPlan) lines.push(`  Plano de ação: ${e.actionPlan}`);
  }
  lines.push("", `Verificação: ${runAt}`);
  lines.push("Verifique no dashboard e registre o plano de ação.");
  return lines.join("\n");
}

// escapeHtml: values are operator-typed (tags, notes, names) - never trust
// them inside markup.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// urgentDigestHtml: premium card layout with inline CSS only (no external
// stylesheets - most inbox clients strip them). Critical barriers get a red
// accent, urgent ones amber, everything else slate.
export function urgentDigestHtml(
  events: DigestEvent[],
  runAt: string,
  brand?: string,
): string {
  const title = brand && brand.trim() !== ""
    ? brand.trim()
    : "Monitor de Barreiras";
  const critical = events.filter((e) => e.urgency === "critical").length;
  const esc = escapeHtml;
  const badge = (e: DigestEvent): string => {
    if (e.urgency === "critical") {
      return `<span style="display:inline-block;background:#b91c1c;color:#ffffff;` +
        `font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 10px;` +
        `border-radius:999px;">CRÍTICA</span>`;
    }
    if (e.urgency === "urgent") {
      return `<span style="display:inline-block;background:#b45309;color:#ffffff;` +
        `font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 10px;` +
        `border-radius:999px;">URGENTE</span>`;
    }
    return `<span style="display:inline-block;background:#475569;color:#ffffff;` +
      `font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 10px;` +
      `border-radius:999px;">${esc(e.urgency.toUpperCase())}</span>`;
  };
  const accent = (e: DigestEvent): string =>
    e.urgency === "critical"
      ? "#dc2626"
      : e.urgency === "urgent"
      ? "#d97706"
      : "#64748b";
  const detailRow = (label: string, value: string | undefined): string => {
    if (!value || value.trim() === "") return "";
    return `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:12px;` +
      `white-space:nowrap;vertical-align:top;">${esc(label)}</td>` +
      `<td style="padding:4px 0;color:#0f172a;font-size:13px;">${
        esc(value)
      }</td></tr>`;
  };
  const cards = events.map((e) => {
    const details = [
      detailRow("Categoria", e.category),
      detailRow("Tipologia", e.typology),
      detailRow("Local", e.locationName),
      detailRow("Agrupamento", e.grouping),
      detailRow("Responsável", e.owner),
      detailRow("Criticidade", e.criticality),
      detailRow("Disponibilidade", e.availability),
      detailRow("Situação", e.compliance),
      detailRow("Desde", e.transitionDate),
    ].filter((s) => s !== "").join("");
    const authorBlock = e.author
      ? `<p style="margin:10px 0 0;font-size:13px;color:#0f172a;">` +
        `Atualizado por: <strong>${esc(e.author)}</strong></p>`
      : "";
    const noteBlock = e.note
      ? `<div style="margin:10px 0 0;border-left:3px solid #cbd5e1;` +
        `padding:6px 12px;color:#334155;font-size:13px;font-style:italic;">` +
        `${esc(e.note)}</div>`
      : "";
    const planBlock = e.actionPlan
      ? `<div style="margin:10px 0 0;background:#f0fdf4;border:1px solid #bbf7d0;` +
        `border-radius:8px;padding:8px 12px;font-size:13px;color:#14532d;">` +
        `<strong>Plano de ação:</strong> ${esc(e.actionPlan)}</div>`
      : "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="margin:0 0 16px;background:#ffffff;border:1px solid #e2e8f0;` +
      `border-radius:12px;overflow:hidden;">` +
      `<tr><td style="height:4px;background:${
        accent(e)
      };font-size:0;line-height:0;">&nbsp;</td></tr>` +
      `<tr><td style="padding:16px 20px;">` +
      `<div style="margin:0 0 6px;">${badge(e)}</div>` +
      `<p style="margin:0 0 2px;font-size:17px;font-weight:700;color:#0f172a;">` +
      `${esc(e.tag)}</p>` +
      `<p style="margin:0 0 8px;font-size:13px;color:#64748b;">` +
      `${esc(e.location)} · ${esc(e.availability)} desde ${
        esc(e.transitionDate)
      }</p>` +
      (details !== ""
        ? `<table role="presentation" cellpadding="0" cellspacing="0" ` +
          `style="margin:6px 0 0;">${details}</table>`
        : "") +
      authorBlock + noteBlock + planBlock +
      `</td></tr></table>`;
  }).join("");
  const summary = critical > 0
    ? `${events.length} barreira${events.length === 1 ? "" : "s"} · ` +
      `${critical} crítica${critical === 1 ? "" : "s"}`
    : `${events.length} barreira${events.length === 1 ? "" : "s"}`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)} - Alerta de barreiras</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f5f9;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="background:#f1f5f9;padding:24px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `style="max-width:600px;width:100%;">` +
    `<tr><td style="background:#0f2a44;border-radius:12px 12px 0 0;` +
    `padding:22px 24px;">` +
    `<p style="margin:0;font-size:12px;letter-spacing:.14em;color:#7dd3fc;` +
    `font-weight:700;">${esc(title).toUpperCase()}</p>` +
    `<p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">` +
    `Alerta de barreiras urgentes</p>` +
    `<p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">${
      esc(summary)
    }</p>` +
    `</td></tr>` +
    `<tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;` +
    `border-radius:0 0 12px 12px;padding:20px;">` +
    cards +
    `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">` +
    `Verificação: ${
      esc(runAt)
    } · Verifique no dashboard e registre o plano de ação.</p>` +
    `</td></tr></table></td></tr></table></body></html>`;
}
