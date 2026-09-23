// TAG builder for mock barriers (prefix-num-loc-suffix) - split from lib/data.ts to keep files small; why: isolates display TAG formatting from dataset generation.
import { CATEGORY_CODES } from "../enums.ts";
import type { Rng } from "./rng.ts";

// ─── TAG prefixes per category (display-level constant, not an enum-worthy domain) ──

const TAG_PREFIX: Record<string, string> = {
  "Válvula de Alívio de Pressão": "PSV",
  "Intertravamento de Segurança - Elemento Iniciador": "SIS-I",
  "Intertravamento de Segurança - Elemento Final": "SIS-F",
  "Sistema Fixo de Combate a Incêndio": "FW",
  "Detectores Fixos de F&G": "GD",
  "Malha de Aterramento / SPDA": "SPDA",
  "Dique de Contenção": "DIQUE",
  "Tampa de Emergência": "TAMPA",
  "Malha de Controle de Processo": "MALHA",
  "Geração de Emergência": "GE",
  "Intertravamento de Segurança - Lógica": "SIS-L",
  "Plano de Resposta a Emergência": "PRE",
  "Sistema de Alívio": "AL",
  "Alarmes de Emergência e Sirene": "OA",
  "Válvula Manual": "VM",
  "Vent": "VENT",
  "CSB - Conjunto Solidário de Barreiras": "CSB",
  "Proteção Passiva": "PP",
  "Botoeira": "BOT",
  "Vaso": "VASO",
  "Disco de Ruptura": "DR",
  "Sistema de drenagem": "DREN",
  "Sistemas de Alívio": "ALS",
  "Trava Mecânica": "TRAVA",
  "Dispositivo de Controlede Bloqueio e Isolamento": "DCBI",
  "Procedimento Crítico": "PC",
  "Sistema de Dispersão": "DISP",
  "UPS": "UPS",
  "Sistema de Proteção contra Descarga Armosférica": "SPDA-P",
};
export { TAG_PREFIX };

// Builds display TAG (prefix-num-loc-suffix) from category id and location.
export function buildTag(
  categoryId: number,
  rng: Rng,
  locCode: string,
): string {
  const catName = CATEGORY_CODES[categoryId];
  const prefix = TAG_PREFIX[catName] ?? "B";
  const num = String(rng.int(1000, 9999));
  const suffix = rng.pick(["A", "B", "C", ""] as const);
  return suffix
    ? `${prefix}-${num}-${locCode}-${suffix}`
    : `${prefix}-${num}-${locCode}`;
}
