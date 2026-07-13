/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENUM RESOLVERS — numeric ⇄ string mapping for every domain constant
 * ══════════════════════════════════════════════════════════════════════════
 * A real backend/API exchanges compact integer codes instead of strings
 * (smaller payloads, locale-independent, safe to rename display labels
 * without a migration). Each domain gets:
 *   - a `*_CODES` map:   id -> string
 *   - a `*_IDS` map:     string -> id   (reverse lookup, built automatically)
 *   - `toXId` / `fromXId` helper functions
 *
 * When wiring a real API, the wire format uses these ids. The UI always
 * works with the resolved string via `fromXId`, so components never need
 * to change.
 */

import type { Disponibilidade, Conformidade, Criticidade } from './types';

// ─── Generic helpers ──────────────────────────────────────────────────────

function buildReverse<T extends string>(codes: Record<number, T>): Record<T, number> {
  const rev = {} as Record<T, number>;
  for (const [id, val] of Object.entries(codes)) {
    rev[val as T] = Number(id);
  }
  return rev;
}

// ─── Location (Instalação) ────────────────────────────────────────────────
// 0 = ALL is intentionally reserved as the "no filter / all locations" sentinel

export const LOCATION_CODES: Record<number, string> = {
  0: 'ALL',
  1: 'FAL',
  2: 'CNC',
  3: 'CNS',
  4: 'FAP',
  5: 'RJO',
  6: 'SPL',
};
export const LOCATION_IDS = buildReverse(LOCATION_CODES);

export function toLocationId(code: string): number {
  return LOCATION_IDS[code] ?? 0;
}
export function fromLocationId(id: number): string {
  return LOCATION_CODES[id] ?? 'ALL';
}

// ─── Disponibilidade (barrier availability status) ───────────────────────

export const DISPONIBILIDADE_CODES: Record<number, Disponibilidade> = {
  0: 'Disponível',
  1: 'Fora de Operação',
  2: 'Indisponível Contingenciado',
  3: 'Degradado Contingenciado',
  4: 'Degradado',
  5: 'Indisponível',
};
export const DISPONIBILIDADE_IDS = buildReverse(DISPONIBILIDADE_CODES);

export function toDisponibilidadeId(v: Disponibilidade): number {
  return DISPONIBILIDADE_IDS[v] ?? 0;
}
export function fromDisponibilidadeId(id: number): Disponibilidade {
  return DISPONIBILIDADE_CODES[id] ?? 'Disponível';
}

// ─── Conformidade ─────────────────────────────────────────────────────────

export const CONFORMIDADE_CODES: Record<number, Conformidade> = {
  0: 'Conforme',
  1: 'Não Conforme',
};
export const CONFORMIDADE_IDS = buildReverse(CONFORMIDADE_CODES);

export function toConformidadeId(v: Conformidade): number {
  return CONFORMIDADE_IDS[v] ?? 0;
}
export function fromConformidadeId(id: number): Conformidade {
  return CONFORMIDADE_CODES[id] ?? 'Conforme';
}

// ─── Criticidade ──────────────────────────────────────────────────────────

export const CRITICIDADE_CODES: Record<number, Criticidade> = {
  0: 'Não Crítica',
  1: 'Crítica',
};
export const CRITICIDADE_IDS = buildReverse(CRITICIDADE_CODES);

export function toCriticidadeId(v: Criticidade): number {
  return CRITICIDADE_IDS[v] ?? 0;
}
export function fromCriticidadeId(id: number): Criticidade {
  return CRITICIDADE_CODES[id] ?? 'Não Crítica';
}

// ─── Categoria da barreira ────────────────────────────────────────────────

export const CATEGORIA_CODES: Record<number, string> = {
  0: 'Válvula de Alívio de Pressão',
  1: 'Alarmes de Emergência e Sirene',
  2: 'Sistema de Detecção de Gás',
  3: 'Sistema de Combate a Incêndio',
  4: 'Válvula de Bloqueio de Emergência',
  5: 'Sistema de Intertravamento (SIS)',
  6: 'Detector de Fumaça',
  7: 'Dispositivo de Corte de Energia',
  8: 'Sistema de Ventilação de Emergência',
  9: 'Detector de H₂S',
};
export const CATEGORIA_IDS = buildReverse(CATEGORIA_CODES);

export function toCategoriaId(v: string): number {
  return CATEGORIA_IDS[v] ?? 0;
}
export function fromCategoriaId(id: number): string {
  return CATEGORIA_CODES[id] ?? CATEGORIA_CODES[0];
}

// ─── Agrupamento ──────────────────────────────────────────────────────────

export const AGRUPAMENTO_CODES: Record<number, string> = {
  0: 'Sistemas de Alívio',
  1: 'Evacuação, Resgate e Abandono',
  2: 'Detecção e Monitoramento',
  3: 'Combate a Incêndio',
  4: 'Controle de Processo',
  5: 'Proteção Elétrica',
};
export const AGRUPAMENTO_IDS = buildReverse(AGRUPAMENTO_CODES);

export function toAgrupamentoId(v: string): number {
  return AGRUPAMENTO_IDS[v] ?? 0;
}
export function fromAgrupamentoId(id: number): string {
  return AGRUPAMENTO_CODES[id] ?? AGRUPAMENTO_CODES[0];
}

// ─── Tipologia da instalação ──────────────────────────────────────────────

export const TIPOLOGIA_CODES: Record<number, string> = {
  0: 'Estação Coletora',
  1: 'Planta de Processamento',
  2: 'Duto de Transferência',
  3: 'Base Operacional',
  4: 'Unidade de Compressão',
  5: 'Unidade de Medição',
};
export const TIPOLOGIA_IDS = buildReverse(TIPOLOGIA_CODES);

export function toTipologiaId(v: string): number {
  return TIPOLOGIA_IDS[v] ?? 0;
}
export function fromTipologiaId(id: number): string {
  return TIPOLOGIA_CODES[id] ?? TIPOLOGIA_CODES[0];
}

// ─── Dono da barreira ─────────────────────────────────────────────────────

export const DONO_CODES: Record<number, string> = {
  0: 'Equipe de Manutenção',
  1: 'Operação FAL',
  2: 'Engenharia de Processo',
  3: 'Segurança Industrial',
  4: 'Instrumentação',
  5: 'Utilidades',
};
export const DONO_IDS = buildReverse(DONO_CODES);

export function toDonoId(v: string): number {
  return DONO_IDS[v] ?? -1; // -1 = "não informado" (no owner assigned)
}
export function fromDonoId(id: number): string {
  return id < 0 ? '' : (DONO_CODES[id] ?? '');
}

// ─── Local description (physical location text) ──────────────────────────

export const LOC_DESC_CODES: Record<number, string> = {
  0:  'Próx. ao Separador de Teste',
  1:  'Próx. ao Manifold de Produção',
  2:  'Área do Compressor Principal',
  3:  'Sala Elétrica Principal',
  4:  'Área de Descarregamento/Carreg.',
  5:  'Próximo às Caldeiras',
  6:  'Caixa de API',
  7:  'Plataforma de Acesso Norte',
  8:  'Área do Tanque de Armazenamento',
  9:  'Subestação Elétrica SE-01',
  10: 'Área de Bombeamento',
  11: 'Torre de Destilação T-100',
  12: 'Unidade de Processamento UP-02',
  13: 'Módulo de Controle MCE',
  14: 'Linha de Transferência LT-300',
  15: 'Ponto de Coleta PC-14',
  16: 'Disjuntor Interligação Gerador',
  17: 'Válvula de Bloqueio Principal',
  18: 'Área de Compressão AC-05',
  19: 'Área de Filtração',
};
export const LOC_DESC_IDS = buildReverse(LOC_DESC_CODES);

export function toLocDescId(v: string): number {
  return LOC_DESC_IDS[v] ?? 0;
}
export function fromLocDescId(id: number): string {
  return LOC_DESC_CODES[id] ?? LOC_DESC_CODES[0];
}

// ─── History author ───────────────────────────────────────────────────────

export const AUTHOR_CODES: Record<number, string> = {
  0: 'João Silva',
  1: 'Maria Santos',
  2: 'Carlos Oliveira',
  3: 'Ana Costa',
  4: 'Pedro Alves',
  5: 'Fernanda Lima',
  6: 'Ricardo Souza',
  7: 'Camila Ferreira',
  8: 'Marcelo Gomes',
  9: 'Patrícia Nunes',
};
export const AUTHOR_IDS = buildReverse(AUTHOR_CODES);

export function toAuthorId(v: string): number {
  return AUTHOR_IDS[v] ?? 0;
}
export function fromAuthorId(id: number): string {
  return AUTHOR_CODES[id] ?? AUTHOR_CODES[0];
}

// ─── Theme & Accent (for settings payloads too) ──────────────────────────

export const THEME_CODES: Record<number, 'light'|'dark'|'amoled'> = {
  0: 'dark', 1: 'light', 2: 'amoled',
};
export const THEME_IDS = buildReverse(THEME_CODES);

export const ACCENT_CODES: Record<number, string> = {
  0: 'blue', 1: 'green', 2: 'red', 3: 'yellow', 4: 'brown', 5: 'mono', 6: 'purple',
};
export const ACCENT_IDS = buildReverse(ACCENT_CODES);
