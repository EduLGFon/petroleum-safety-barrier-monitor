// Enum codes for barrier taxonomy (category/grouping/typology/owner) - split from lib/enums.ts to keep files small; why: groups catalog-like domains used by filters and mock generator.
import { buildReverse } from "./codes.ts";

// ─── Barrier category (sheet-real GERAL Categoria, frequency order) ───
// '0' and the two 'TAG correto ...' rows in the sheet are data-entry noise,
// not categories, so they stay out; the import maps unknowns to its fallback.

export const CATEGORY_CODES: Record<number, string> = {
  0: "Válvula de Alívio de Pressão",
  1: "Intertravamento de Segurança - Elemento Iniciador",
  2: "Intertravamento de Segurança - Elemento Final",
  3: "Sistema Fixo de Combate a Incêndio",
  4: "Detectores Fixos de F&G",
  5: "Malha de Aterramento / SPDA",
  6: "Dique de Contenção",
  7: "Tampa de Emergência",
  8: "Malha de Controle de Processo",
  9: "Geração de Emergência",
  10: "Intertravamento de Segurança - Lógica",
  11: "Plano de Resposta a Emergência",
  12: "Sistema de Alívio",
  13: "Alarmes de Emergência e Sirene",
  14: "Válvula Manual",
  15: "Vent",
  16: "CSB - Conjunto Solidário de Barreiras",
  17: "Proteção Passiva",
  18: "Botoeira",
  19: "Vaso",
  20: "Disco de Ruptura",
  21: "Sistema de drenagem",
  22: "Sistemas de Alívio",
  23: "Trava Mecânica",
  24: "Dispositivo de Controlede Bloqueio e Isolamento",
  25: "Procedimento Crítico",
  26: "Sistema de Dispersão",
  27: "UPS",
  28: "Sistema de Proteção contra Descarga Armosférica",
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
