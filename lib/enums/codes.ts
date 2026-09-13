// Enum codes for location and barrier status (location/disponibilidade/conformidade/criticidade) - split from lib/enums.ts to keep files small; why: isolates core status resolvers used by filters and API wire format.
import type { Conformidade, Criticidade, Disponibilidade } from "../types.ts";

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

// ─── Location (Instalação) ────────────────────────────────────────────────
// 0 = ALL is intentionally reserved as the "no filter / all locations" sentinel
// Pattern for every domain below: toXId maps display string -> wire id
// (undefined when unknown — callers must skip the filter and warn, never
// silently substitute a wrong known id). fromXId maps wire id -> display
// string (explicit unknown sentinel, never a plausible known label).

export const LOCATION_CODES: Record<number, string> = {
  0: "ALL",
  1: "FAL",
  2: "CNC",
  3: "CNS",
  4: "FAP",
  5: "RJO",
  6: "SPL",
};
export const LOCATION_IDS = buildReverse(LOCATION_CODES);

export function toLocationId(code: string): number | undefined {
  return LOCATION_IDS[code];
}
export function fromLocationId(id: number): string {
  return LOCATION_CODES[id] ?? `ST-${id}`;
}

// ─── Disponibilidade (barrier availability status) ───────────────────────

export const DISPONIBILIDADE_CODES: Record<number, Disponibilidade> = {
  0: "Disponível",
  1: "Fora de Operação",
  2: "Indisponível Contingenciado",
  3: "Degradado Contingenciado",
  4: "Degradado",
  5: "Indisponível",
};
export const DISPONIBILIDADE_IDS = buildReverse(DISPONIBILIDADE_CODES);

export function toDisponibilidadeId(v: Disponibilidade): number | undefined {
  return DISPONIBILIDADE_IDS[v];
}
export function fromDisponibilidadeId(id: number): Disponibilidade {
  return DISPONIBILIDADE_CODES[id] ?? `Disponibilidade (${id})`;
}

// ─── Conformidade ─────────────────────────────────────────────────────────

export const CONFORMIDADE_CODES: Record<number, Conformidade> = {
  0: "Conforme",
  1: "Não Conforme",
};
export const CONFORMIDADE_IDS = buildReverse(CONFORMIDADE_CODES);

export function toConformidadeId(v: Conformidade): number | undefined {
  return CONFORMIDADE_IDS[v];
}
export function fromConformidadeId(id: number): Conformidade {
  return CONFORMIDADE_CODES[id] ?? `Conformidade (${id})`;
}

// ─── Criticidade ──────────────────────────────────────────────────────────

export const CRITICIDADE_CODES: Record<number, Criticidade> = {
  0: "Não Crítica",
  1: "Crítica",
};
export const CRITICIDADE_IDS = buildReverse(CRITICIDADE_CODES);

export function toCriticidadeId(v: Criticidade): number | undefined {
  return CRITICIDADE_IDS[v];
}
export function fromCriticidadeId(id: number): Criticidade {
  return CRITICIDADE_CODES[id] ?? `Criticidade (${id})`;
}
