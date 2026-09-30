// Alert templates - the urgent digest subject and bodies, in repo.
// This is why it exists: email copy is a reviewable artifact, not a string
// buried in the send path. Subjects stay ASCII-safe; every send ships a
// plain-text body plus a premium HTML part (multipart/alternative).
//
// Layout contract (chosen Concept A + B depth, C fallback):
// - <= COMPACT_THRESHOLD barriers: one premium before/after card per
//   barrier (critical first), with the full audit trail that makes the
//   message self-sufficient (old → new, context, attribution, history,
//   note, action plan + next steps). Mirrors the sync-change row diff.
// - > COMPACT_THRESHOLD: one compact digest table (one row per barrier)
//   so large digests stay readable; full detail lives in the dashboard.
// Copy is pt-BR. Old rows (enqueued before enrichment) still render,
// showing only what is present.
import type { Urgency } from "../../dashboard/urgent.ts";

export interface HistoryTrailEntry {
  date: string;
  status: string;
  author?: string;
  note?: string;
}

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
  // Before/after diff (sync-change parity). oldAvailability is the status
  // replaced by this transition; the new side is `availability` above.
  // Absent on first imports / stale reminders / legacy rows.
  oldAvailability?: string;
  oldCompliance?: string;
  previousDate?: string;
  source?: "Manual" | "Sincronização Fracttal";
  barrierId?: number;
  historyTrail?: HistoryTrailEntry[];
}

// EmailOptions: brand renders the header; dashboardUrl (APP_BASE_URL)
// renders "Ver no dashboard" links. Both optional so misconfigured
// environments still send a complete, link-free email.
export interface EmailOptions {
  brand?: string;
  dashboardUrl?: string;
}

// COMPACT_THRESHOLD: above this many barriers the digest switches from
// per-barrier premium cards to the compact table (Concept C fallback).
export const COMPACT_THRESHOLD = 8;

// shouldUseCompact: the single switch both body and HTML builders share so
// the plain-text and rich parts never disagree on layout.
export function shouldUseCompact(count: number): boolean {
  return count > COMPACT_THRESHOLD;
}

// SubjectLead: rank/status context for the subject line. criticality is
// the single barrier's rank (ESO/A/B/C/D…); newStatus its landing status;
// ranks lists every rank present in a multi-barrier digest. Callers that
// omit it get the legacy [Barreiras] shape below.
export interface SubjectLead {
  criticality?: string;
  newStatus?: string;
  ranks?: string[];
}

// RANK_ORDER: severity order for the [A/B] prefix - most severe first.
const RANK_ORDER = ["ESO", "A", "B", "C", "D"];

function rankWeight(rank: string): number {
  const i = RANK_ORDER.indexOf(rank.trim().toUpperCase());
  return i >= 0 ? i : RANK_ORDER.length;
}

// formatDateBR: ISO (YYYY-MM-DD…) to the Brazilian default DD/MM/YYYY.
// Falls back to the raw value when it doesn't parse, never throwing inside
// a render path.
export function formatDateBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.slice(0, 10));
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// formatDateTimeBR: ISO instant to "DD/MM/YYYY, HH:mm UTC" (UTC-based so the
// stamp reads the same in every inbox and test run).
export function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${
    p(d.getUTCMonth() + 1)
  }/${d.getUTCFullYear()}, ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// rankPrefix: distinct ranks, most severe first, capped at three
// ([A], [A/B], [ESO/A/B]…). Unknown values sort after the known ranks.
function rankPrefix(ranks: string[]): string {
  const distinct = [
    ...new Set(ranks.map((r) => r.trim()).filter((r) => r !== "")),
  ];
  distinct.sort((a, b) => rankWeight(a) - rankWeight(b) || a.localeCompare(b));
  return distinct.slice(0, 3).join("/");
}

// urgentDigestSubject: triage-ready subject. With rank info it leads with
// the criticality - "[A] Atualização de barreira: PSV-2101 agora
// Indisponível" for one barrier, "[A/B] Atualização de 3 barreiras
// (1 crítica)" for a digest - so severity and scope read from the inbox.
// Without rank info it keeps the legacy [Barreiras] shape.
export function urgentDigestSubject(
  count: number,
  critical: number,
  leadTag?: string,
  lead?: SubjectLead,
): string {
  const tag = leadTag?.trim();
  const ranks = lead?.ranks && lead.ranks.length > 0
    ? lead.ranks
    : lead?.criticality
    ? [lead.criticality]
    : [];
  if (ranks.length > 0) {
    const prefix = rankPrefix(ranks);
    if (count === 1 && tag) {
      const status = lead?.newStatus?.trim();
      return `[${prefix}] Atualização de barreira: ${tag.slice(0, 40)}` +
        (status ? ` agora ${status}` : "");
    }
    const what = count === 1
      ? "Atualização de 1 barreira"
      : `Atualização de ${count} barreiras`;
    const crit = critical > 0
      ? ` (${critical} crítica${critical > 1 ? "s" : ""})`
      : "";
    return `[${prefix}] ${what}${crit}`;
  }
  const what = count === 1
    ? "1 barreira urgente"
    : `${count} barreiras urgentes`;
  const crit = critical > 0
    ? ` (${critical} crítica${critical > 1 ? "s" : ""})`
    : "";
  const leadSuffix = count === 1 && tag ? `: ${tag.slice(0, 40)}` : "";
  return `[Barreiras] ${what}${crit}${leadSuffix}`;
}

// immediateSubject: same subject as the digest, prefixed so inbox triage
// tells at-once mail apart from the periodic digest.
export function immediateSubject(
  count: number,
  critical: number,
  leadTag?: string,
  lead?: SubjectLead,
): string {
  return `[Imediato] ${urgentDigestSubject(count, critical, leadTag, lead)}`;
}

// changeLine: "Disponível → Indisponível" when the before side is known,
// "segue Indisponível" for reminders without a predecessor.
function changeLine(e: DigestEvent): string {
  if (e.oldAvailability && e.oldAvailability !== e.availability) {
    return `${e.oldAvailability} → ${e.availability}`;
  }
  return `segue ${e.availability}`;
}

function complianceLine(e: DigestEvent): string {
  if (
    e.oldCompliance && e.compliance && e.oldCompliance !== e.compliance
  ) {
    return `${e.oldCompliance} → ${e.compliance}`;
  }
  return e.compliance ?? "";
}

function barrierLink(
  opts: EmailOptions | undefined,
  barrierId?: number,
): string {
  const base = opts?.dashboardUrl?.replace(/\/+$/, "");
  if (!base) return "";
  void barrierId; // deep links don't exist yet - every CTA goes to root
  return base;
}

// urgentDigestBody: plain-text fallback. First line per event keeps the
// legacy shape (flag + tag + location + status + date + criticality) so
// existing filters keep matching; old → new and audit lines follow.
export function urgentDigestBody(
  events: DigestEvent[],
  runAt: string,
  opts?: EmailOptions,
): string {
  const lines: string[] = [
    "Novas barreiras em estado urgente detectadas pelo monitor:",
    "",
  ];
  if (shouldUseCompact(events.length)) {
    lines.push(
      `Resumo: ${events.length} barreiras (detalhe completo no dashboard).`,
      "",
    );
    for (const e of events) {
      const flag = e.urgency === "critical" ? "[CRÍTICA] " : "";
      lines.push(
        `• ${flag}${e.tag} (${e.location}): ${changeLine(e)} ` +
          `desde ${
            formatDateBR(e.transitionDate)
          } · criticidade ${e.criticality}` +
          (e.owner ? ` · ${e.owner}` : ""),
      );
    }
    lines.push("", `Verificação: ${formatDateTimeBR(runAt)}`);
    const link = barrierLink(opts, undefined);
    lines.push(
      link !== ""
        ? `Ver todas no dashboard: ${link}`
        : "Verifique no dashboard e registre o plano de ação.",
    );
    return lines.join("\n");
  }
  for (const e of events) {
    const flag = e.urgency === "critical" ? "[CRÍTICA] " : "";
    lines.push(
      `• ${flag}${e.tag} (${e.location}) - ${e.availability} ` +
        `desde ${
          formatDateBR(e.transitionDate)
        } · criticidade ${e.criticality}`,
    );
    lines.push(`  O que mudou: ${changeLine(e)}`);
    const comp = complianceLine(e);
    if (comp !== "") lines.push(`  Situação: ${comp}`);
    const context = [
      e.category ? `categoria ${e.category}` : "",
      e.typology ? `tipologia ${e.typology}` : "",
      e.locationName ? `local ${e.locationName}` : "",
      e.grouping ? `agrupamento ${e.grouping}` : "",
      e.owner ? `responsável ${e.owner}` : "",
    ].filter((s) => s !== "");
    if (context.length > 0) lines.push(`  ${context.join(" · ")}`);
    const origin = [
      e.source ? `origem ${e.source}` : "",
      e.author ? `por ${e.author}` : "",
      e.previousDate ? `(antes desde ${formatDateBR(e.previousDate)})` : "",
    ].filter((s) => s !== "").join(" ");
    if (origin !== "") lines.push(`  Atualizado ${origin}`);
    if (e.note) lines.push(`  Nota: ${e.note}`);
    if (e.actionPlan) {
      lines.push(`  Plano de ação: ${e.actionPlan}`);
    } else {
      lines.push(`  Plano de ação: (sem plano de ação)`);
    }
    if (e.historyTrail && e.historyTrail.length > 0) {
      const trail = e.historyTrail.map((h) =>
        `${formatDateBR(h.date)} ${h.status}` +
        (h.author ? ` (${h.author})` : "") +
        (h.note ? `: ${h.note}` : "")
      ).join("; ");
      lines.push(`  Histórico: ${trail}`);
    }
    const link = barrierLink(opts, e.barrierId);
    if (link !== "") lines.push(`  Ver: ${link}`);
    lines.push("");
  }
  lines.push(`Verificação: ${formatDateTimeBR(runAt)}`);
  const root = barrierLink(opts, undefined);
  lines.push(
    root !== ""
      ? `Verifique no dashboard (${root}) e registre o plano de ação.`
      : "Verifique no dashboard e registre o plano de ação.",
  );
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

function resolveOptions(
  brandOrOpts?: string | EmailOptions,
  opts?: EmailOptions,
): EmailOptions {
  if (typeof brandOrOpts === "string") {
    return { brand: brandOrOpts, ...opts };
  }
  return { ...(brandOrOpts ?? {}), ...opts };
}

// urgentDigestHtml: premium card layout with inline CSS only (no external
// stylesheets - most inbox clients strip them). Critical barriers get a red
// accent, urgent ones amber, everything else slate. Above
// COMPACT_THRESHOLD events it renders the compact table instead.
export function urgentDigestHtml(
  events: DigestEvent[],
  runAt: string,
  brandOrOpts?: string | EmailOptions,
  maybeOpts?: EmailOptions,
): string {
  const options = resolveOptions(brandOrOpts, maybeOpts);
  const brand = options.brand;
  const title = brand && brand.trim() !== ""
    ? brand.trim()
    : "Monitor de Barreiras";
  const critical = events.filter((e) => e.urgency === "critical").length;
  const esc = escapeHtml;
  const compact = shouldUseCompact(events.length);
  const summary = critical > 0
    ? `${events.length} barreira${events.length === 1 ? "" : "s"} · ` +
      `${critical} crítica${critical === 1 ? "" : "s"}`
    : `${events.length} barreira${events.length === 1 ? "" : "s"}`;
  const rootLink = barrierLink(options, undefined);
  const header =
    `<tr><td style="background:#0f2a44;border-radius:16px 16px 0 0;` +
    `padding:26px 28px;">` +
    `<p style="margin:0;font-size:11px;letter-spacing:.16em;color:#7dd3fc;` +
    `font-weight:700;">${esc(title).toUpperCase()}</p>` +
    `<p style="margin:8px 0 0;font-size:22px;font-weight:800;color:#ffffff;` +
    `line-height:1.25;">${
      compact ? "Resumo de barreiras urgentes" : "Alerta de barreiras urgentes"
    }</p>` +
    `<p style="margin:8px 0 0;font-size:13px;color:#cbd5e1;">${
      esc(summary)
    }</p>` +
    `<p style="margin:10px 0 0;">` +
    `<span style="display:inline-block;background:rgba(125,211,252,.14);` +
    `border:1px solid rgba(125,211,252,.35);color:#e0f2fe;font-size:12px;` +
    `font-weight:700;padding:4px 12px;border-radius:999px;">` +
    `${events.length} ${
      events.length === 1 ? "barreira neste alerta" : "barreiras neste alerta"
    }</span>` +
    (critical > 0
      ? ` <span style="display:inline-block;background:#b91c1c;color:#ffffff;` +
        `font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;">` +
        `${critical} crítica${critical === 1 ? "" : "s"}</span>`
      : "") +
    `</p></td></tr>`;
  const footer =
    (rootLink !== ""
      ? `<p style="margin:16px 0 0;"><a href="${esc(rootLink)}" ` +
        `style="display:inline-block;background:#0f2a44;color:#ffffff;` +
        `font-size:13px;font-weight:700;text-decoration:none;` +
        `padding:10px 20px;border-radius:10px;">Ver no dashboard</a></p>`
      : "") +
    `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">` +
    `Verificado em ${esc(formatDateTimeBR(runAt))}.</p>`;
  const bodyInner = compact
    ? compactTable(events, options)
    : events.map((e) => premiumCard(e, options)).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)} - Alerta de barreiras</title></head>` +
    `<body style="margin:0;padding:0;background:#eef2f7;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="background:#eef2f7;padding:24px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="640" cellpadding="0" cellspacing="0" ` +
    `style="max-width:640px;width:100%;">` +
    header +
    `<tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;` +
    `border-radius:0 0 16px 16px;padding:22px;">` +
    bodyInner + footer +
    `</td></tr></table></td></tr></table></body></html>`;
}

function pill(text: string, bg: string): string {
  return `<span style="display:inline-block;background:${bg};color:#ffffff;` +
    `font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 10px;` +
    `border-radius:999px;">${escapeHtml(text)}</span>`;
}

function badge(e: DigestEvent): string {
  if (e.urgency === "critical") return pill("CRÍTICA", "#b91c1c");
  if (e.urgency === "urgent") return pill("URGENTE", "#b45309");
  return pill(e.urgency.toUpperCase(), "#475569");
}

function sourcePill(source: DigestEvent["source"]): string {
  if (!source) return "";
  const bg = source === "Manual" ? "#0369a1" : "#6d28d9";
  return ` ${pill(source === "Manual" ? "MANUAL" : "FRACTTAL", bg)}`;
}

function accent(e: DigestEvent): string {
  return e.urgency === "critical"
    ? "#dc2626"
    : e.urgency === "urgent"
    ? "#d97706"
    : "#64748b";
}

// changeTable: the old → new hero block. Status always renders; compliance
// renders when known. Unchanged values show "segue X" instead of an arrow.
function changeTable(e: DigestEvent): string {
  const esc = escapeHtml;
  const changed = e.oldAvailability && e.oldAvailability !== e.availability;
  const oldV = e.oldAvailability ?? "-";
  const arrow = changed ? "→" : "·";
  const newColor = changed ? "#b91c1c" : "#0f172a";
  const comp = complianceLine(e);
  const compRow = comp !== ""
    ? `<tr>` +
      `<td style="padding:7px 10px 7px 0;color:#64748b;font-size:12px;` +
      `white-space:nowrap;vertical-align:top;">Situação</td>` +
      `<td style="padding:7px 0;font-size:13px;color:#475569;">${
        esc(comp)
      }</td>` +
      `</tr>`
    : "";
  const sinceRow = e.previousDate
    ? `<tr>` +
      `<td style="padding:7px 10px 7px 0;color:#64748b;font-size:12px;` +
      `white-space:nowrap;vertical-align:top;">Antes desde</td>` +
      `<td style="padding:7px 0;font-size:13px;color:#475569;">` +
      `${esc(formatDateBR(e.previousDate))}</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin:12px 0 0;background:#f8fafc;border:1px solid #e2e8f0;` +
    `border-radius:10px;padding:4px 14px;">` +
    `<tr><td style="padding:8px 0 0;font-size:11px;font-weight:800;` +
    `letter-spacing:.1em;color:#64748b;">O QUE MUDOU</td></tr>` +
    `<tr>` +
    `<td style="padding:7px 10px 7px 0;color:#64748b;font-size:12px;` +
    `white-space:nowrap;vertical-align:top;">Status</td>` +
    `<td style="padding:7px 0;font-size:13px;">` +
    `<span style="color:#64748b;text-decoration:${
      changed ? "line-through" : "none"
    };">${esc(oldV)}</span>` +
    ` <span style="color:#94a3b8;font-weight:700;">${arrow}</span> ` +
    `<strong style="color:${newColor};">${esc(e.availability)}</strong>` +
    ` <span style="color:#64748b;">desde ${
      esc(formatDateBR(e.transitionDate))
    }</span>` +
    `</td></tr>` + compRow + sinceRow +
    `</table>`;
}

function detailGrid(e: DigestEvent): string {
  const esc = escapeHtml;
  const cell = (label: string, value: string | undefined): string => {
    if (!value || value.trim() === "") return "";
    return `<td style="padding:5px 12px 5px 0;vertical-align:top;">` +
      `<div style="font-size:11px;color:#94a3b8;font-weight:700;` +
      `letter-spacing:.06em;">${esc(label.toUpperCase())}</div>` +
      `<div style="font-size:13px;color:#0f172a;">${esc(value)}</div></td>`;
  };
  const rows: string[] = [];
  const r1 = cell("Categoria", e.category) + cell("Tipologia", e.typology);
  if (r1 !== "") rows.push(`<tr>${r1}</tr>`);
  const r2 = cell("Agrupamento", e.grouping) + cell("Responsável", e.owner);
  if (r2 !== "") rows.push(`<tr>${r2}</tr>`);
  const r3 = cell("Criticidade", e.criticality) +
    cell("Local", e.locationName ?? e.location);
  if (r3 !== "") rows.push(`<tr>${r3}</tr>`);
  if (rows.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" ` +
    `cellspacing="0" style="margin:12px 0 0;">${rows.join("")}</table>`;
}

// premiumCard: Concept A surface with Concept B depth - hero diff, context,
// attribution, history trail, note, plan (or missing-plan CTA), dashboard link.
function premiumCard(e: DigestEvent, opts: EmailOptions): string {
  const esc = escapeHtml;
  const link = barrierLink(opts, e.barrierId);
  const attribution = (e.author || e.source)
    ? `<p style="margin:12px 0 0;font-size:13px;color:#334155;">` +
      `Atualizado por: <strong>${esc(e.author ?? "-")}</strong>` +
      (e.source
        ? ` <span style="color:#64748b;">· ${esc(e.source)}</span>`
        : "") +
      `</p>`
    : "";
  const trail = e.historyTrail && e.historyTrail.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="margin:12px 0 0;">` +
      `<tr><td style="font-size:11px;font-weight:800;letter-spacing:.1em;` +
      `color:#64748b;padding:0 0 4px;">HISTÓRICO RECENTE</td></tr>` +
      e.historyTrail.map((h) =>
        `<tr><td style="padding:3px 0;font-size:12px;color:#475569;">` +
        `• ${esc(formatDateBR(h.date))} · <strong>${esc(h.status)}</strong>` +
        (h.author ? ` · ${esc(h.author)}` : "") +
        (h.note
          ? ` <span style="color:#64748b;">“${esc(h.note)}”</span>`
          : "") +
        `</td></tr>`
      ).join("") +
      `</table>`
    : "";
  const noteBlock = e.note
    ? `<div style="margin:12px 0 0;border-left:3px solid #0ea5e9;` +
      `padding:8px 12px;color:#334155;font-size:13px;font-style:italic;` +
      `background:#f0f9ff;border-radius:0 8px 8px 0;">${esc(e.note)}</div>`
    : "";
  const planBlock = e.actionPlan
    ? `<div style="margin:12px 0 0;background:#f0fdf4;border:1px solid #bbf7d0;` +
      `border-radius:10px;padding:10px 14px;font-size:13px;color:#14532d;">` +
      `<strong>Plano de ação:</strong> ${esc(e.actionPlan)}</div>`
    : `<div style="margin:12px 0 0;background:#fffbeb;border:1px solid #fde68a;` +
      `border-radius:10px;padding:10px 14px;font-size:13px;color:#92400e;">` +
      `<strong>Sem plano de ação.</strong></div>`;
  const cta = link !== ""
    ? `<p style="margin:14px 0 0;"><a href="${esc(link)}" ` +
      `style="display:inline-block;background:#0f2a44;color:#ffffff;` +
      `font-size:13px;font-weight:700;text-decoration:none;` +
      `padding:10px 20px;border-radius:10px;">Abrir no dashboard</a></p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin:0 0 18px;background:#ffffff;border:1px solid #e2e8f0;` +
    `border-radius:14px;overflow:hidden;">` +
    `<tr><td style="height:5px;background:${accent(e)};` +
    `font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `<tr><td style="padding:18px 22px 20px;">` +
    `<div style="margin:0 0 8px;">${badge(e)}${sourcePill(e.source)}</div>` +
    `<p style="margin:0;font-size:19px;font-weight:800;color:#0f172a;` +
    `line-height:1.3;">${esc(e.tag)}</p>` +
    `<p style="margin:4px 0 0;font-size:13px;color:#64748b;">` +
    `${esc(e.location)}${
      e.locationName && e.locationName !== e.location
        ? ` · ${esc(e.locationName)}`
        : ""
    } · criticidade ${esc(e.criticality)}</p>` +
    changeTable(e) + detailGrid(e) + attribution + trail + noteBlock +
    planBlock + cta +
    `</td></tr></table>`;
}

// compactTable: Concept C fallback for large digests - one row per barrier
// with the before → after that matters, plus owner for delegation.
function compactTable(events: DigestEvent[], opts: EmailOptions): string {
  const esc = escapeHtml;
  void opts;
  const rows = events.map((e) => {
    const dot = e.urgency === "critical" ? "#dc2626" : "#d97706";
    return `<tr>` +
      `<td style="padding:9px 10px;border-top:1px solid #e2e8f0;` +
      `font-size:13px;white-space:nowrap;">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:99px;` +
      `background:${dot};margin-right:8px;"></span>` +
      `<strong style="color:#0f172a;">${esc(e.tag)}</strong></td>` +
      `<td style="padding:9px 10px;border-top:1px solid #e2e8f0;font-size:12px;` +
      `color:#475569;">${esc(changeLine(e))}<br>` +
      `<span style="color:#94a3b8;">${esc(formatDateBR(e.transitionDate))} · ${
        esc(e.criticality)
      }</span></td>` +
      `<td style="padding:9px 10px;border-top:1px solid #e2e8f0;font-size:12px;` +
      `color:#475569;">${esc(e.owner ?? "-")}</td>` +
      `</tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin:0 0 6px;background:#ffffff;border:1px solid #e2e8f0;` +
    `border-radius:14px;overflow:hidden;">` +
    `<tr><td style="padding:14px 18px 6px;font-size:11px;font-weight:800;` +
    `letter-spacing:.1em;color:#64748b;">${events.length} BARREIRAS: ` +
    `DETALHE COMPLETO NO DASHBOARD</td></tr>` +
    `<tr><td style="padding:0 8px 8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    rows + `</table></td></tr></table>`;
}
