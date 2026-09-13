// TAG builder for mock barriers (prefix-num-loc-suffix) - split from lib/data.ts to keep files small; why: isolates display TAG formatting from dataset generation.
import { CATEGORIA_CODES } from "../enums.ts";
import type { Rng } from "./rng.ts";

// ─── TAG prefixes per category (display-level constant, not an enum-worthy domain) ──

const TAG_PREFIX: Record<string, string> = {
  "Válvula de Alívio de Pressão": "PSV",
  "Alarmes de Emergência e Sirene": "OA",
  "Sistema de Detecção de Gás": "GD",
  "Sistema de Combate a Incêndio": "FW",
  "Válvula de Bloqueio de Emergência": "EBV",
  "Sistema de Intertravamento (SIS)": "SIS",
  "Detector de Fumaça": "FD",
  "Dispositivo de Corte de Energia": "ESD",
  "Sistema de Ventilação de Emergência": "VE",
  "Detector de H₂S": "H2S",
};
export { TAG_PREFIX };

// Builds display TAG (prefix-num-loc-suffix) from category id and location.
export function buildTag(catId: number, rng: Rng, locCode: string): string {
  const catName = CATEGORIA_CODES[catId];
  const prefix = TAG_PREFIX[catName] ?? "B";
  const num = String(rng.int(1000, 9999));
  const suffix = rng.pick(["A", "B", "C", ""] as const);
  return suffix
    ? `${prefix}-${num}-${locCode}-${suffix}`
    : `${prefix}-${num}-${locCode}`;
}
