// Enum codes for barrier taxonomy (category/grouping/typology/owner) - split from lib/enums.ts to keep files small; why: groups catalog-like domains used by filters and mock generator.
import { buildReverse } from "./codes.ts";

// ─── Barrier category ────────────────────────────────────────────────────

export const CATEGORY_CODES: Record<number, string> = {
  0: "Válvula de Alívio de Pressão",
  1: "Alarmes de Emergência e Sirene",
  2: "Sistema de Detecção de Gás",
  3: "Sistema de Combate a Incêndio",
  4: "Válvula de Bloqueio de Emergência",
  5: "Sistema de Intertravamento (SIS)",
  6: "Detector de Fumaça",
  7: "Dispositivo de Corte de Energia",
  8: "Sistema de Ventilação de Emergência",
  9: "Detector de H₂S",
};
export const CATEGORY_IDS = buildReverse(CATEGORY_CODES);

export function toCategoryId(v: string): number | undefined {
  return CATEGORY_IDS[v];
}
export function fromCategoryId(id: number): string {
  return CATEGORY_CODES[id] ?? `Categoria (${id})`;
}

// ─── Grouping ─────────────────────────────────────────────────────────────

export const GROUPING_CODES: Record<number, string> = {
  0: "Sistemas de Alívio",
  1: "Evacuação, Resgate e Abandono",
  2: "Detecção e Monitoramento",
  3: "Combate a Incêndio",
  4: "Controle de Processo",
  5: "Proteção Elétrica",
};
export const GROUPING_IDS = buildReverse(GROUPING_CODES);

export function fromGroupingId(id: number): string {
  return GROUPING_CODES[id] ?? `Agrupamento (${id})`;
}

// ─── Installation typology ────────────────────────────────────────────────

export const TYPOLOGY_CODES: Record<number, string> = {
  0: "Estação Coletora",
  1: "Planta de Processamento",
  2: "Duto de Transferência",
  3: "Base Operacional",
  4: "Unidade de Compressão",
  5: "Unidade de Medição",
};
export const TYPOLOGY_IDS = buildReverse(TYPOLOGY_CODES);

export function fromTypologyId(id: number): string {
  return TYPOLOGY_CODES[id] ?? `Tipologia (${id})`;
}

// ─── Barrier owner ────────────────────────────────────────────────────────

export const OWNER_CODES: Record<number, string> = {
  0: "Equipe de Manutenção",
  1: "Operação FAL",
  2: "Engenharia de Processo",
  3: "Segurança Industrial",
  4: "Instrumentação",
  5: "Utilidades",
};
export const OWNER_IDS = buildReverse(OWNER_CODES);

export function fromOwnerId(id: number): string {
  if (id < 0) return "";
  return OWNER_CODES[id] ?? `Dono (${id})`;
}
