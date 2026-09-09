// Enum codes for barrier taxonomy (categoria/agrupamento/tipologia/dono) - split from lib/enums.ts to keep files small; why: groups catalog-like domains used by filters and mock generator.
import { buildReverse } from "./codes.ts";

// ─── Categoria da barreira ────────────────────────────────────────────────

export const CATEGORIA_CODES: Record<number, string> = {
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
export const CATEGORIA_IDS = buildReverse(CATEGORIA_CODES);

export function toCategoriaId(v: string): number | undefined {
  return CATEGORIA_IDS[v];
}
export function fromCategoriaId(id: number): string {
  return CATEGORIA_CODES[id] ?? `Categoria (${id})`;
}

// ─── Agrupamento ──────────────────────────────────────────────────────────

export const AGRUPAMENTO_CODES: Record<number, string> = {
  0: "Sistemas de Alívio",
  1: "Evacuação, Resgate e Abandono",
  2: "Detecção e Monitoramento",
  3: "Combate a Incêndio",
  4: "Controle de Processo",
  5: "Proteção Elétrica",
};
export const AGRUPAMENTO_IDS = buildReverse(AGRUPAMENTO_CODES);

export function fromAgrupamentoId(id: number): string {
  return AGRUPAMENTO_CODES[id] ?? `Agrupamento (${id})`;
}

// ─── Tipologia da instalação ──────────────────────────────────────────────

export const TIPOLOGIA_CODES: Record<number, string> = {
  0: "Estação Coletora",
  1: "Planta de Processamento",
  2: "Duto de Transferência",
  3: "Base Operacional",
  4: "Unidade de Compressão",
  5: "Unidade de Medição",
};
export const TIPOLOGIA_IDS = buildReverse(TIPOLOGIA_CODES);

export function fromTipologiaId(id: number): string {
  return TIPOLOGIA_CODES[id] ?? `Tipologia (${id})`;
}

// ─── Dono da barreira ─────────────────────────────────────────────────────

export const DONO_CODES: Record<number, string> = {
  0: "Equipe de Manutenção",
  1: "Operação FAL",
  2: "Engenharia de Processo",
  3: "Segurança Industrial",
  4: "Instrumentação",
  5: "Utilidades",
};
export const DONO_IDS = buildReverse(DONO_CODES);

export function fromDonoId(id: number): string {
  if (id < 0) return "";
  return DONO_CODES[id] ?? `Dono (${id})`;
}
