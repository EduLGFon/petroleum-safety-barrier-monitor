export type Theme = "light" | "dark" | "amoled";
export type AccentColor =
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "brown"
  | "mono"
  | "purple";

// Domain vocabularies - open string unions on purpose. The known literals
// give autocomplete, while `string & {}` keeps new station statuses,
// categories, owners, etc. compilable without a code change (dynamic-data
// principle in agents.md). Never narrow these back to closed unions.
// (The ban-types ignores below are intentional: openness is the design.)
export type Disponibilidade =
  | "Disponível"
  | "Fora de Operação"
  | "Indisponível Contingenciado"
  | "Degradado Contingenciado"
  | "Degradado"
  | "Indisponível"
  // deno-lint-ignore ban-types
  | (string & {});

// deno-lint-ignore ban-types
export type Conformidade = "Conforme" | "Não Conforme" | (string & {});
// deno-lint-ignore ban-types
export type Criticidade = "Crítica" | "Não Crítica" | (string & {});

export interface StatusHistoryEntry {
  date: string;
  status: Disponibilidade;
  author: string;
  note: string;
}

export interface Barrier {
  id: number;
  tag: string;
  tipologia: string;
  instalacao: string;
  locDesc: string;
  criticidade: Criticidade;
  categoria: string;
  agrupamento: string;
  dono: string;
  disponibilidade: Disponibilidade;
  conformidade: Conformidade;
  comentarios: string;
  planoAcao: string;
  statusSince: string;
  statusHistory: StatusHistoryEntry[];
}

export interface Location {
  code: string;
  name: string;
  tipo: string;
}

export interface KpiSnapshot {
  total: number;
  disponivel: number;
  foraDeOp: number;
  indispCont: number;
  degrCont: number;
  degradado: number;
  indisponivel: number;
  conforme: number;
  naoConforme: number;
  pctConforme: number;
  criticasNC: number;
  // Dynamic buckets - the fixed fields above are the well-known fast path,
  // these maps carry EVERY value present in the data (including future ones)
  // so totals always reconcile and new statuses never go missing. Optional
  // because the DB-wire path only carries fixed fields; computeKpi (the
  // dashboard path) always fills them.
  byDisponibilidade?: Record<string, number>;
  byConformidade?: Record<string, number>;
  byCriticidade?: Record<string, number>;
}

export interface CategoryConformidade {
  name: string;
  Conforme: number;
  "Não Conforme": number;
}

export type SortableColumn = keyof Pick<
  Barrier,
  | "id"
  | "tag"
  | "criticidade"
  | "categoria"
  | "disponibilidade"
  | "conformidade"
  | "statusSince"
>;

export interface FilterState {
  query: string;
  disponibilidade: string;
  conformidade: string;
  categoria: string;
  page: number;
  pageSize: number;
  sortCol: SortableColumn;
  sortDir: "asc" | "desc";
}
