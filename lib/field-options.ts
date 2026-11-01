// Field options - curated answer lists for barrier sheet questions.
// This is why it exists: the editor and the admin manager share one field
// registry (keys, pt-BR labels, seed defaults from the Fracttal-fed barriers
// table), so option lists stay consistent without hardcoded copies per
// consumer.
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

// SEED_DEFAULTS: starting option lists derived from the live Fracttal-fed
// barriers table (18k rows, 2026-11): top values per column by frequency.
// Ternaries/binaries match deriveSheetFields output exactly (no "Verificar",
// no "Sem Classificação" - both have zero rows); free-text columns with huge
// cardinality (equip_typology: 17k distinct, install_local: 5k distinct)
// seed only their top values as suggestions. Admins curate further in
// Settings; "Restaurar padrão" puts these back.
export const SEED_DEFAULTS: Record<FieldKey, string[]> = {
  origin: [
    "Gerenciamento das Barreiras de Segurança Operacional: SGSO-PG-0016",
    "SGSO-PG-0016",
    "SGI-LEC-0007",
    "SGI-LEC-0003R00",
    "SGI-LEC-0003",
    "SGI-LEC-0009",
    "SGI-LEC-0008",
    "SGI-LEC-0004",
    "SGI-LEC-0006",
    "HAZOP-2023/046",
    "HAZOP-2023/046.",
  ],
  installLocal: [
    "CJ Equipamentos de Superfície",
    "CJ Equipamentos de Poço",
    "Cj Equipamento de Poço",
    "Em Manutenção - SM-8",
    "Em Manutenção - FAL",
    "Cj Extintores Combate Incêndio ABC 4,5kg",
    "CJ Extintores Combate Incêndio Portátil 4,5kg",
    "Cj Extintores - Base Seacrest",
    "CJ Válvulas Manuais Comb Incêndio",
    "Cj PN Gavetas CCM",
    "CJ Mangueiras Comb Incêndio",
    "Em Manutenção - Base Seacrest",
    "Em Manutenção - FSR",
    "Cj Instrumentos Cadeia A",
    "Moto Compressor Gás MC-II - PSE - SM-08",
  ],
  equipTypology: [
    "Conversor de Frequência",
    "Motor Elétrico",
    "Unidade de Bombeio (UB)",
    "Switch HP",
    "Distribuidor Interno Óptico",
    "Patch Panel 01 Usuário",
    "Redutor Unidade Bombeio (UB)",
    "Patch Panel 02 Usuário",
    "Motor Elétrico (Removido)",
    "Motor elétrico",
    "Regua de alimentação - Coluna 01",
    "Unidade de bombeio (UB)",
    "Painel Distribuição Elétrica",
    "QC - Quadro Continuidade (-48V)",
    "Transmissor de Pressão",
  ],
  category: [
    "Base e acesso",
    "Linha de Produção",
    "Indicador de Pressão",
    "Motor Elétrico",
    "Transmissor Indicador de Pressão",
    "Válvula de Controle",
    "Conversor de Frequência",
    "Válvula de Segurança",
    "Sensor de Temperatura",
    "Extintor ABC",
    "Transformador",
    "Painel Elétrico",
    "Tanque",
    "Gaveta",
    "Redutor Unidade Bombeio",
    "Unidade de Bombeio",
    "Bomba",
    "Pressostato",
    "Transmissor Indicador de Temperatura",
    "Vaso de pressão",
  ],
  evidenceCode: [],
  outOfService: ["Sim", "Não"],
  fieldInstalled: ["Sim", "Não"],
  fieldOperational: ["Sim", "Não"],
  opStatus: ["Disponível", "Fora de Operação", "Degradada", "Indisponível"],
  hasMaintPlan: ["Sim", "Não"],
  planFollowed: ["Sim", "Não"],
  failureFree: ["Sim", "Não"],
  maintStatus: ["Disponível", "Indisponível", "Degradada"],
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
