// Urgent predicate - the one shared definition of "needs attention now".
// This is why it exists: the NcAlert card (ncCount), the "urgentes" view and
// the P5 alert emails each had an implicit copy of the rule (non-conforme,
// fail-closed). One predicate keeps the dashboard count, the email digest
// and the detector in agreement by construction - not a new rules engine,
// just the existing rule extracted, tiered and ordered.
import type { Barrier } from "../types.ts";

export type Urgency = "critical" | "urgent" | "none";

// urgencyOf: tiers a barrier. Critical is non-conforme AND Crítica;
// urgent is any other non-conforme (fail-closed: novel statuses count,
// same as computeKpi and the NcAlert card); Conforme is none.
export function urgencyOf(b: Barrier): Urgency {
  if (b.compliance === "Conforme") return "none";
  return b.criticality === "Crítica" ? "critical" : "urgent";
}

// isUrgent: the detector and digest gate. Matches the NcAlert card count
// exactly (every non-Conforme barrier, nothing else).
export function isUrgent(b: Barrier): boolean {
  return urgencyOf(b) !== "none";
}

// compareUrgency: critical first, then longest non-conforme (oldest
// statusSince), then stable id order. A missing statusSince sorts last -
// unknown age must not jump the queue.
export function compareUrgency(a: Barrier, b: Barrier): number {
  const rank = (x: Barrier): number =>
    urgencyOf(x) === "critical" ? 0 : urgencyOf(x) === "urgent" ? 1 : 2;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const sa = a.statusSince === "" ? "\uffff" : a.statusSince;
  const sb = b.statusSince === "" ? "\uffff" : b.statusSince;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.id - b.id;
}

// urgentBarriers: the "ver urgentes" list - filtered and ordered. Pure, so
// the island, the export and the email digest all sort identically.
export function urgentBarriers(list: Barrier[]): Barrier[] {
  return list.filter(isUrgent).sort(compareUrgency);
}
