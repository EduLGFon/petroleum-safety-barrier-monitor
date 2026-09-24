// Field options - curated answer lists for barrier sheet questions.
// This is why it exists: the editor and the admin manager share one field
// registry (keys, pt-BR labels, seed defaults from the GERAL extraction),
// so option lists stay consistent without hardcoded copies per consumer.
export const FIELD_KEYS = [
  "origin",
  "installLocal",
  "equipTypology",
  "category",
  "evidenceCode",
  "outOfService",
  "fieldInstalled",
  "fieldOperational",
  "opStatus",
  "hasMaintPlan",
  "planFollowed",
  "failureFree",
  "maintStatus",
  "hasContingency",
] as const;

export type FieldKey = typeof FIELD_KEYS[number];

// FIELD_LABELS: pt-BR display names for the admin manager and editor.
export const FIELD_LABELS: Record<FieldKey, string> = {
  origin: "Origem",
  installLocal: "Local de Instalação",
  equipTypology: "Tipologia Equipamento",
  category: "Categoria",
  evidenceCode: "Código Evidência",
  outOfService: "Fora de Operação?",
  fieldInstalled: "Elemento em Campo?",
  fieldOperational: "Elemento Operacional?",
  opStatus: "Status Operacional",
  hasMaintPlan: "Possui Plano?",
  planFollowed: "Plano Cumprido?",
  failureFree: "Sem Falha?",
  maintStatus: "Status Manutenção",
  hasContingency: "Há Contingência?",
};

export function isFieldKey(raw: unknown): raw is FieldKey {
  return typeof raw === "string" &&
    (FIELD_KEYS as readonly string[]).includes(raw);
}

// SEED_DEFAULTS: starting option lists from scripts/sheet-options.json
// canonicals, with sheet typos fixed (Indisponivel, presão, Controlede and
// junk like "0" dropped). Admins curate further in Settings.
export const SEED_DEFAULTS: Record<FieldKey, string[]> = {
  origin: [
    "Gerenciamento das Barreiras de Segurança Operacional: SGSO-PG-0016",
    "HAZOP: RL-3655.00-1200-98X-SEA-001",
    "HAZOP: RL-3680.00-1253-98X-SEA-001",
    "HAZOP: RL-3656.01-1221-98G-SEA-001",
    "HAZOP: RL-3653.01-1221-98X-SEA-001",
    "APR: RL-3600.00-1210-98V-SEA-001",
    "HAZOP: RL-3692.01-5131-98G-SEA-001",
    "APR: RL-3656.01-1221-983-PBA-001",
  ],
  installLocal: [
    "Sistema Combate a Incêndio FAL",
    "Sistema Combate a Incêndio - SM-08",
    "Cj Detectores de Gás Estação - FAL",
    "Sistema Geração de Vapor para Injeção (UGVF's) - FAL-20",
    "Cj Detectores de Gás Estação - FAL-20",
    "Cj Detectores de Gás - SM-8",
    "Sistema Geração de Vapor para Injeção - IBU-26",
    "Sistema de Tratamento de Petróleo FAL",
    "Sistema Captação Tratamento e Bombeio Água - IBU-26",
    "Sistema de Tocha (Flare) FAL",
    "Sistema Tratamento Gás - FAL-20",
    "Cj Detectores de Gás - FSR",
  ],
  equipTypology: [
    "Válvula de Segurança de Pressão",
    "Detector de Gás",
    "Transmissor Indicador de Pressão",
    "Sistema de Combate a Incêndio",
    "Painel Elétrico dos Poços de produção (intertravamento por pressão alta)",
    "Válvula",
    "Válvula de Desligamento/Fechamento de Emergência",
    "Painel Elétrico",
    "Dique de Contenção",
    "Transmissor de Pressão",
    "Bomba",
    "Tampa de Emergência",
    "Hidrante",
    "Transmissor de Nível",
    "Sistema de Proteção contra Descarga Atmosférica",
  ],
  category: [
    "Válvula de Alívio de Pressão",
    "Intertravamento de Segurança - Elemento Iniciador",
    "Intertravamento de Segurança - Elemento Final",
    "Sistema Fixo de Combate a Incêndio",
    "Detectores Fixos de F&G",
    "Malha de Aterramento / SPDA",
    "Dique de Contenção",
    "Tampa de Emergência",
    "Malha de Controle de Processo",
    "Geração de Emergência",
    "Intertravamento de Segurança - Lógica",
    "Plano de Resposta a Emergência",
    "Sistema de Alívio",
    "Alarmes de Emergência e Sirene",
    "Válvula Manual",
    "CSB - Conjunto Solidário de Barreiras",
    "Proteção Passiva",
    "Disco de Ruptura",
    "Procedimento Crítico",
  ],
  evidenceCode: [],
  outOfService: ["Sim", "Não"],
  fieldInstalled: ["Sim", "Não"],
  fieldOperational: ["Sim", "Não"],
  opStatus: ["Disponível", "Indisponível", "Sem Classificação"],
  hasMaintPlan: ["Sim", "Verificar", "Não"],
  planFollowed: ["Sim", "Verificar", "Não"],
  failureFree: ["Sim", "Verificar", "Não"],
  maintStatus: ["Disponível", "Degradada"],
  hasContingency: ["Sim", "Não"],
};

export const MAX_OPTIONS = 200;
export const MAX_OPTION_LEN = 200;

// normalizeOptions: trims, drops empties, dedupes (exact match), caps count
// and length. Throws as 400 on non-array input or an empty result.
export function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("options must be an array");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") throw new Error("options must be strings");
    const v = item.trim().replace(/\s+/g, " ").slice(0, MAX_OPTION_LEN);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_OPTIONS) break;
  }
  if (out.length === 0) throw new Error("options must not be empty");
  return out;
}
