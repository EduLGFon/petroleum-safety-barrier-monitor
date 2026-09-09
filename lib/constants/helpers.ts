// Small pure helpers for status checks and distinct lists - split from lib/constants.ts to keep files small; why: shared data utilities used by filters and resolve logic.
import type { Disponibilidade } from "../types.ts";

const CONFORME_STATUSES: Disponibilidade[] = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
];
// True for statuses counted as Conforme (Disponível + contingenciados).
export function isConforme(s: Disponibilidade): boolean {
  return CONFORME_STATUSES.includes(s);
}

/** Distinct option values present in the data, sorted by frequency then name.
 *  Single O(N) pass - feeds filter selects and any future faceted control. */
export function distinctBy<T>(items: T[], pick: (t: T) => string): string[] {
  const freq = new Map<string, number>();
  for (const it of items) {
    const k = pick(it);
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([k]) => k);
}
