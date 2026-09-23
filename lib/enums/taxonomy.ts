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
  2: "Intertravamento de Segurança",
  3: "Resposta à Emergência da Brigada",
  4: "Resposta à Emergência da Operação",
  5: "Sistemas de Proteção Pós Liberação",
  6: "Controle de Fonte de Ignição",
  7: "Alarmes Críticos e Intervenção Humana",
};
export const GROUPING_IDS = buildReverse(GROUPING_CODES);

export function fromGroupingId(id: number): string {
  return GROUPING_CODES[id] ?? `Agrupamento (${id})`;
}

// ─── Installation typology ────────────────────────────────────────────────

export const TYPOLOGY_CODES: Record<number, string> = {
  0: "Estação Coletora",
  1: "Campo",
  2: "Duto de Transferência",
  3: "Poço (RTSGI)",
  4: "Estação de Vapor",
  5: "Subestação",
};
export const TYPOLOGY_IDS = buildReverse(TYPOLOGY_CODES);

export function fromTypologyId(id: number): string {
  return TYPOLOGY_CODES[id] ?? `Tipologia (${id})`;
}

// ─── Barrier owner ────────────────────────────────────────────────────────

export const OWNER_CODES: Record<number, string> = {
  0: "Operação",
  1: "SMS",
  2: "Manutenção",
};
export const OWNER_IDS = buildReverse(OWNER_CODES);

export function fromOwnerId(id: number): string {
  if (id < 0) return "";
  return OWNER_CODES[id] ?? `Dono (${id})`;
}
