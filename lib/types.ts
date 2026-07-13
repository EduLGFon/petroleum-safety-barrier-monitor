export type Theme = 'light' | 'dark' | 'amoled';

export type Disponibilidade =
  | 'Disponível'
  | 'Fora de Operação'
  | 'Indisponível Contingenciado'
  | 'Degradado Contingenciado'
  | 'Degradado'
  | 'Indisponível';

export type Conformidade = 'Conforme' | 'Não Conforme';
export type Criticidade  = 'Crítica' | 'Não Crítica';

export interface StatusHistoryEntry {
  date: string; status: Disponibilidade; author: string; note: string;
}

export interface Barrier {
  id: number; tag: string; tipologia: string; instalacao: string;
  locDesc: string; criticidade: Criticidade; categoria: string;
  agrupamento: string; dono: string; disponibilidade: Disponibilidade;
  conformidade: Conformidade; comentarios: string; planoAcao: string;
  statusSince: string; statusHistory: StatusHistoryEntry[];
}

export interface Location { code: string; name: string; tipo: string; }

export interface KpiSnapshot {
  total: number; disponivel: number; foraDeOp: number;
  indispCont: number; degrCont: number; degradado: number;
  indisponivel: number; conforme: number; naoConforme: number;
  pctConforme: number; criticasNC: number;
}

export interface CategoryConformidade {
  name: string; Conforme: number; 'Não Conforme': number;
}

export type SortableColumn = keyof Pick<
  Barrier, 'id'|'tag'|'criticidade'|'categoria'|'disponibilidade'|'conformidade'
>;

export interface FilterState {
  query: string; disponibilidade: string; conformidade: string;
  categoria: string; page: number; pageSize: number;
  sortCol: SortableColumn; sortDir: 'asc' | 'desc';
}
