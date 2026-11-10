// Status explanation - derives the cause of the current barrier availability
// at read time from persisted status-history notes and comments. Pure module
// (no Preact, DOM, or server imports) so the details modal can show the
// decisive WO/WR without schema, API, wire, or sync changes.
// See DECISIONS.md#D36.

import type { Availability, Barrier, StatusHistoryEntry } from "./types.ts";

export const STATUS_RULES: Record<string, string> = {
  "Disponível": "Livre de falhas ou defeitos.",
  "Degradado":
    "Possui SS, OS ou tarefa de corretiva planejada (falha potencial) com atributo de urgência no ativo.",
  "Indisponível":
    "Possui SS, OS ou tarefa de corretiva emergencial (falha funcional) com atributo de urgência no ativo.",
  "Fora de Operação":
    "Equipamento protegido fora de operação, isolado positivamente do processo.",
};

export type StatusCauseKind =
  | "work-order"
  | "work-request"
  | "import"
  | "manual"
  | "stopped-asset"
  | "out-of-service"
  | "asset-unavailable"
  | "planned-without-urgency"
  | "available"
  | "unknown";

export type WorkSourceType =
  | "Ordem de serviço"
  | "Solicitação de serviço";

export interface ParsedWorkNote {
  sourceType: WorkSourceType;
  operationState: string;
  classification: string;
  reference: string;
  detail: string;
  contingency: string;
}

export interface StatusCause {
  kind: StatusCauseKind;
  date?: string;
  sourceType?: WorkSourceType;
  operationState?: string;
  classification?: string;
  reference?: string;
  detail?: string;
  contingency?: string;
  rawNote?: string;
  author?: string;
  participants?: Array<{ name: string; role: string }>;
}

export interface StatusExplanation {
  status: Availability;
  rule: string;
  since: string;
  cause: StatusCause;
  historyEntry: StatusHistoryEntry | null;
}

const RULE_FALLBACK = "Sem regra documentada para este status.";
const CONTINGENCY_MARKER = ". Sinal de contingência";
const LABELS = ["Classificação:", "Referência:", "Detalhe:"] as const;

// Trims surrounding space and trailing sentence punctuation so parsed labels
// never carry the join dot into the explanation card.
function trimPunctuation(value: string): string {
  return value.trim().replace(/[.;\s]+$/, "").trim();
}

// Separates the optional contingency suffix from the note body. Only the
// trailing sync suffix counts: either the fixed identified phrase or a colon
// payload at the very end. A "Sinal de contingência" mention inside Detalhe
// with more text after it is left untouched, and periods/newlines in Detalhe
// survive because the body is sliced before the suffix only.
function splitContingency(note: string): { body: string; text: string } {
  const at = note.lastIndexOf(CONTINGENCY_MARKER);
  if (at < 0) return { body: note.trim(), text: "" };
  const tail = note.slice(at + CONTINGENCY_MARKER.length).trim();
  const identified = tail === "identificado nos dados Fracttal";
  const colon = /^:\s*([\s\S]*)$/.exec(tail);
  if (!identified && !colon) return { body: note.trim(), text: "" };
  return {
    body: note.slice(0, at).trim(),
    text: identified
      ? "identificado nos dados Fracttal"
      : trimPunctuation(colon?.[1] ?? ""),
  };
}

// Reads one deterministic label until the next canonical label starts. The
// lookahead list lets Detalhe keep internal periods without truncation.
function readLabel(
  text: string,
  label: string,
  next: readonly string[],
): string {
  const start = text.indexOf(label);
  if (start < 0) return "";
  const from = start + label.length;
  let end = text.length;
  for (const marker of next) {
    const at = text.indexOf(marker, from);
    if (at >= 0 && at < end) end = at;
  }
  return trimPunctuation(text.slice(from, end));
}

// Parses the deterministic work note written by the sync:
// "<tipo> <estado>. Classificação: ... Referência: ... Detalhe: ...".
// Returns null for any other phrase, including stopped-asset text that starts
// with "Ordem de serviço" but has no open/closed operation state.
export function parseWorkNote(note: string): ParsedWorkNote | null {
  const { body, text: contingency } = splitContingency(note);
  const head = /^(Ordem de serviço|Solicitação de serviço)\s+/.exec(body);
  if (!head) return null;
  const afterSource = body.slice(head[0].length).trim();
  const dot = afterSource.indexOf(". ");
  const stateText = dot < 0 ? afterSource : afterSource.slice(0, dot);
  const operationState = trimPunctuation(stateText);
  if (!/^(em aberto|concluída)\b/i.test(operationState)) return null;
  const labels = dot < 0 ? "" : afterSource.slice(dot + 2).trim();
  return {
    sourceType: head[1] as WorkSourceType,
    operationState,
    classification: readLabel(labels, LABELS[0], [LABELS[1], LABELS[2]]),
    reference: readLabel(labels, LABELS[1], [LABELS[2]]),
    detail: readLabel(labels, LABELS[2], []),
    contingency,
  };
}

// Base status behind the contingency display overlay (docs/STATUSES.md):
// stored 4/5 + Has Contingency = Sim displays as 3/2, while history rows keep
// the stored base. Matching both lets the overlay find its decisive entry.
function baseStatus(status: Availability): Availability {
  if (status === "Degradado Contingenciado") return "Degradado";
  if (status === "Indisponível Contingenciado") return "Indisponível";
  return status;
}

function latestEntry(
  history: StatusHistoryEntry[],
  targets: Set<string>,
): StatusHistoryEntry | null {
  let best: StatusHistoryEntry | null = null;
  for (const entry of history) {
    if (!targets.has(entry.status)) continue;
    if (!best || entry.date >= best.date) best = entry;
  }
  return best;
}

function latestOf(history: StatusHistoryEntry[]): StatusHistoryEntry | null {
  let best: StatusHistoryEntry | null = null;
  for (const entry of history) {
    if (!best || entry.date >= best.date) best = entry;
  }
  return best;
}

function isKnownSyncPhrase(note: string): boolean {
  if (parseWorkNote(note)) return true;
  const n = note.toLowerCase();
  return n === "importado do fracttal" ||
    n.includes("equipamento parado") ||
    n.includes("fracttal informa fora de operação desde") ||
    n.includes("ativo como indisponível") ||
    n.includes("condição de indisponibilidade") ||
    n.includes("corretiva planejada aberta sem marcador de urgência") ||
    n.includes("ativo consta como disponível") ||
    n.includes("não retornou sinal de corretiva aberta") ||
    n.includes("sinal de contingência");
}

function causeKind(
  note: string,
  author: string,
  status: Availability,
): StatusCauseKind {
  const parsed = parseWorkNote(note);
  if (parsed) {
    return parsed.sourceType === "Solicitação de serviço"
      ? "work-request"
      : "work-order";
  }
  const n = note.toLowerCase();
  if (n === "importado do fracttal") return "import";
  if (
    note.trim() === "Edição de barreira" ||
    (note.trim() !== "" && author !== "Sincronização Fracttal" &&
      !isKnownSyncPhrase(note))
  ) {
    return "manual";
  }
  if (
    n.includes("equipamento parado") &&
    !n.includes("não houve sinal") &&
    !n.includes("não retornou sinal")
  ) {
    return "stopped-asset";
  }
  if (n.includes("fora de operação desde")) return "out-of-service";
  if (
    n.includes("ativo como indisponível") ||
    n.includes("condição de indisponibilidade")
  ) {
    return "asset-unavailable";
  }
  if (n.includes("corretiva planejada aberta sem marcador de urgência")) {
    return "planned-without-urgency";
  }
  if (
    n.includes("ativo consta como disponível") ||
    n.includes("não retornou sinal de corretiva aberta") ||
    status === "Disponível"
  ) {
    return "available";
  }
  return "unknown";
}

// Explains the displayed availability from the latest matching history entry.
// Falls back to the latest entry, then to a synthetic no-history cause. The
// decisive event is already persisted by the sync/import, so nothing is
// written here and the caller stays read-only.
export function explainStatus(
  b: Pick<
    Barrier,
    | "availability"
    | "statusSince"
    | "statusHistory"
    | "comments"
    | "hasContingency"
    | "contingencyDesc"
  >,
): StatusExplanation {
  const status = b.availability;
  const rule = STATUS_RULES[status] ?? STATUS_RULES[baseStatus(status)] ??
    RULE_FALLBACK;
  const history = b.statusHistory ?? [];
  const targets = new Set<string>([status, baseStatus(status)]);
  const selected = latestEntry(history, targets) ?? latestOf(history);
  const comments = b.comments.trim();

  if (!selected) {
    return {
      status,
      rule,
      since: b.statusSince,
      cause: {
        kind: status === "Disponível" ? "available" : "unknown",
        ...(status !== "Disponível" && comments ? { reference: comments } : {}),
      },
      historyEntry: null,
    };
  }

  const parsed = parseWorkNote(selected.note);
  const suffix = splitContingency(selected.note).text;
  const kind = causeKind(selected.note, selected.author, status);
  const reference = parsed?.reference ||
    (comments && status !== "Disponível" ? comments : "");
  const contingency = suffix ||
    (b.hasContingency === "Sim" ? b.contingencyDesc.trim() : "");
  const cause: StatusCause = {
    kind,
    date: selected.date,
    author: selected.author,
    ...(selected.participants && selected.participants.length > 0
      ? { participants: selected.participants }
      : {}),
    ...(parsed
      ? {
        sourceType: parsed.sourceType,
        operationState: parsed.operationState,
        ...(parsed.classification
          ? { classification: parsed.classification }
          : {}),
        ...(parsed.detail ? { detail: parsed.detail } : {}),
      }
      : {}),
    ...(reference ? { reference } : {}),
    ...(contingency ? { contingency } : {}),
    ...(kind === "manual" || kind === "unknown"
      ? { rawNote: selected.note }
      : {}),
  };

  return { status, rule, since: b.statusSince, cause, historyEntry: selected };
}
