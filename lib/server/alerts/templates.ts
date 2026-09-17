// Alert templates - the urgent digest subject and body, in repo (P5).
// This is why it exists: email copy is a reviewable artifact, not a string
// buried in the send path. Plain text, pt-BR, one digest per recipient per
// run listing every new urgent transition, critical first.
import type { Urgency } from "../../dashboard/urgent.ts";

export interface DigestEvent {
  tag: string;
  location: string;
  availability: string;
  criticality: string;
  transitionDate: string;
  urgency: Urgency;
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

// urgentDigestBody: one line per event, critical first, then the run stamp.
export function urgentDigestBody(events: DigestEvent[], runAt: string): string {
  const line = (e: DigestEvent): string => {
    const flag = e.urgency === "critical" ? "[CRÍTICA] " : "";
    return `• ${flag}${e.tag} (${e.location}) - ${e.availability} ` +
      `desde ${e.transitionDate} · criticidade ${e.criticality}`;
  };
  return [
    "Novas barreiras em estado urgente detectadas pelo monitor:",
    "",
    ...events.map(line),
    "",
    `Verificação: ${runAt}`,
    "Verifique no dashboard e registre o plano de ação.",
  ].join("\n");
}
