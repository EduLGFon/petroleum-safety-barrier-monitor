// Enum codes for free-text-ish context domains (loc-desc/author/theme/accent) - split from lib/enums.ts to keep files small; why: isolates history and settings payload resolvers.
import { buildReverse } from "./codes.ts";

// ─── Local description (physical location text) ──────────────────────────

export const LOC_DESC_CODES: Record<number, string> = {
  0: "Próx. ao Separador de Teste",
  1: "Próx. ao Manifold de Produção",
  2: "Área do Compressor Principal",
  3: "Sala Elétrica Principal",
  4: "Área de Descarregamento/Carreg.",
  5: "Próximo às Caldeiras",
  6: "Caixa de API",
  7: "Plataforma de Acesso Norte",
  8: "Área do Tanque de Armazenamento",
  9: "Subestação Elétrica SE-01",
  10: "Área de Bombeamento",
  11: "Torre de Destilação T-100",
  12: "Unidade de Processamento UP-02",
  13: "Módulo de Controle MCE",
  14: "Linha de Transferência LT-300",
  15: "Ponto de Coleta PC-14",
  16: "Disjuntor Interligação Gerador",
  17: "Válvula de Bloqueio Principal",
  18: "Área de Compressão AC-05",
  19: "Área de Filtração",
};
export const LOC_DESC_IDS = buildReverse(LOC_DESC_CODES);

export function toLocDescId(v: string): number | undefined {
  return LOC_DESC_IDS[v];
}
export function fromLocDescId(id: number): string {
  return LOC_DESC_CODES[id] ?? `Local (${id})`;
}

// ─── History author ───────────────────────────────────────────────────────

export const AUTHOR_CODES: Record<number, string> = {
  0: "João Silva",
  1: "Maria Santos",
  2: "Carlos Oliveira",
  3: "Ana Costa",
  4: "Pedro Alves",
  5: "Fernanda Lima",
  6: "Ricardo Souza",
  7: "Camila Ferreira",
  8: "Marcelo Gomes",
  9: "Patrícia Nunes",
};
export const AUTHOR_IDS = buildReverse(AUTHOR_CODES);

export function toAuthorId(v: string): number | undefined {
  return AUTHOR_IDS[v];
}
export function fromAuthorId(id: number): string {
  return AUTHOR_CODES[id] ?? `Autor (${id})`;
}

// ─── Theme & Accent (for settings payloads too) ──────────────────────────

export const THEME_CODES: Record<number, "light" | "dark" | "amoled"> = {
  0: "dark",
  1: "light",
  2: "amoled",
};
export const THEME_IDS = buildReverse(THEME_CODES);

export const ACCENT_CODES: Record<number, string> = {
  0: "blue",
  1: "green",
  2: "red",
  3: "yellow",
  4: "brown",
  5: "mono",
  6: "purple",
};
export const ACCENT_IDS = buildReverse(ACCENT_CODES);
