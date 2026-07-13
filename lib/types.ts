// ─── Domain types ──────────────────────────────────────────────────────────────

export type Theme           = 'light' | 'dark' | 'amoled';
export type Disponibilidade = 'Disponível' | 'Degradada' | 'Fora de Operação' | 'Em Manutenção';
export type Conformidade    = 'Conforme' | 'Não Conforme' | 'Não avaliado';
export type Criticidade     = 'Barreira Crítica' | 'Barreira Relevante';

export interface StatusHistoryEntry {
  date:   string;          // ISO YYYY-MM-DD
  status: Disponibilidade;
  author: string;
  note:   string;
}

export interface Barrier {
  id:              number;
  tag:             string;
  tipologia:       string;
  instalacao:      string;
  locDesc:         string;
  criticidade:     Criticidade;
  categoria:       string;
  agrupamento:     string;
  dono:            string;
  disponibilidade: Disponibilidade;
  conformidade:    Conformidade;
  comentarios:     string;
  planoAcao:       string;
  // Degradation tracking
  degradedSince?:   string;    // ISO date — set when status becomes Degradada
  lastContingency?: string;    // ISO date — last time a contingency was defined
  statusHistory:    StatusHistoryEntry[];
}

export interface Location {
  code: string;
  name: string;
  tipo: string;
}

// ─── Aggregated view ──────────────────────────────────────────────────────────

export interface KpiSnapshot {
  total:          number;
  disponivel:     number;
  degradada:      number;
  foraDe:         number;
  emManutencao:   number;
  conforme:       number;
  naoConforme:    number;
  naoAvaliado:    number;
  pctConforme:    number;
  pctNaoConforme: number;
}

export interface CategoryConformidade {
  name:             string;
  Conforme:         number;
  'Não Conforme':   number;
  'Não avaliado':   number;
}

// ─── Filter / sort state ──────────────────────────────────────────────────────

export type SortableColumn = keyof Pick<
  Barrier,
  'id' | 'tag' | 'criticidade' | 'categoria' | 'disponibilidade' | 'conformidade'
>;

export interface FilterState {
  query:           string;
  disponibilidade: string;
  conformidade:    string;
  categoria:       string;
  page:            number;
  pageSize:        number;
  sortCol:         SortableColumn;
  sortDir:         'asc' | 'desc';
}
