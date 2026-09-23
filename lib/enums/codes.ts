// Enum codes for location and barrier status (location/availability/compliance/criticality) - split from lib/enums.ts to keep files small; why: isolates core status resolvers used by filters and API wire format.
import type { Availability, Compliance, Criticality } from "../types.ts";

// ─── Generic helpers ──────────────────────────────────────────────────────

// Builds string->id reverse map from an id->string codes table.
export function buildReverse<T extends string>(
  codes: Record<number, T>,
): Record<T, number> {
  const rev = {} as Record<T, number>;
  for (const [id, val] of Object.entries(codes)) {
    rev[val as T] = Number(id);
  }
  return rev;
}

// ─── Location ─────────────────────────────────────────────────────────────
// 0 = ALL is intentionally reserved as the "no filter / all locations" sentinel
// Pattern for every domain below: toXId maps display string -> wire id
// (undefined when unknown - callers must skip the filter and warn, never
// silently substitute a wrong known id). fromXId maps wire id -> display
// string (explicit unknown sentinel, never a plausible known label).

export const LOCATION_CODES: Record<number, string> = {
  0: "ALL",
  1: "FAL",
  2: "SML",
  3: "FSR",
  4: "IBU",
  5: "FSL",
  6: "CNC",
  7: "JCT",
  8: "FSJ",
};
export const LOCATION_IDS = buildReverse(LOCATION_CODES);

export function toLocationId(code: string): number | undefined {
  return LOCATION_IDS[code];
}
export function fromLocationId(id: number): string {
  return LOCATION_CODES[id] ?? `ST-${id}`;
}

// ─── Availability (barrier status) ────────────────────────────────────────

export const AVAILABILITY_CODES: Record<number, Availability> = {
  0: "Disponível",
  1: "Fora de Operação",
  2: "Indisponível Contingenciado",
  3: "Degradado Contingenciado",
  4: "Degradado",
  5: "Indisponível",
};
export const AVAILABILITY_IDS = buildReverse(AVAILABILITY_CODES);

export function toAvailabilityId(v: Availability): number | undefined {
  return AVAILABILITY_IDS[v];
}
export function fromAvailabilityId(id: number): Availability {
  return AVAILABILITY_CODES[id] ?? `Disponibilidade (${id})`;
}

// ─── Compliance ───────────────────────────────────────────────────────────

export const COMPLIANCE_CODES: Record<number, Compliance> = {
  0: "Conforme",
  1: "Não Conforme",
};
export const COMPLIANCE_IDS = buildReverse(COMPLIANCE_CODES);

export function toComplianceId(v: Compliance): number | undefined {
  return COMPLIANCE_IDS[v];
}
export function fromComplianceId(id: number): Compliance {
  return COMPLIANCE_CODES[id] ?? `Conformidade (${id})`;
}

// ─── Criticality ──────────────────────────────────────────────────────────

export const CRITICALITY_CODES: Record<number, Criticality> = {
  0: "Não Crítica",
  1: "Crítica",
};
export const CRITICALITY_IDS = buildReverse(CRITICALITY_CODES);

export function toCriticalityId(v: Criticality): number | undefined {
  return CRITICALITY_IDS[v];
}
export function fromCriticalityId(id: number): Criticality {
  return CRITICALITY_CODES[id] ?? `Criticidade (${id})`;
}
