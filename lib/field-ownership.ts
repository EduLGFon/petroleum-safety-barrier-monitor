// Field ownership - admin-edited barrier fields the Fracttal sync must not
// overwrite. This is why it exists: PATCH lets admins fix any synced column,
// but the sync rewrote them all on the next touch, silently reverting the
// edit. Ownership records which fields an admin took over per barrier (stored
// in barriers.manual_fields); the sync excludes owned fields from its
// signature and its UPDATE, and the editor offers a per-field revert.
export const OWNABLE_FIELD_KEYS = [
  "tag",
  "locationId",
  "typologyId",
  "categoryId",
  "groupingId",
  "ownerId",
  "criticalityId",
  "comments",
  "actionPlan",
  "origin",
  "installLocal",
  "equipTypology",
  "fieldInstalled",
  "fieldOperational",
  "opStatus",
  "hasMaintPlan",
  "planFollowed",
  "failureFree",
  "maintStatus",
  "hasContingency",
  "contingencyDesc",
  "evidenceCode",
  "degradationDesc",
  "extraComments",
] as const;

export type OwnableFieldKey = typeof OWNABLE_FIELD_KEYS[number];

// isOwnableField: narrows unknown release-list entries to the PATCH-editable
// set. Availability is intentionally absent: status ownership already rides
// the history-author guard, and isActive/locDescId/scopeSource are sync-only
// (the editor never sends them).
export function isOwnableField(raw: unknown): raw is OwnableFieldKey {
  return typeof raw === "string" &&
    (OWNABLE_FIELD_KEYS as readonly string[]).includes(raw);
}

// FIELD_COLUMNS: camelCase ownership key -> barriers column. hasContingency
// and contingencyDesc share one UPDATE fragment (the desc is only meaningful
// with Sim), so owning hasContingency owns the pair; see sync.ts applyPlan.
export const FIELD_COLUMNS: Record<OwnableFieldKey, string> = {
  tag: "tag",
  locationId: "location_id",
  typologyId: "typology_id",
  categoryId: "category_id",
  groupingId: "grouping_id",
  ownerId: "owner_id",
  criticalityId: "criticality_id",
  comments: "comments",
  actionPlan: "action_plan",
  origin: "origin",
  installLocal: "install_local",
  equipTypology: "equip_typology",
  fieldInstalled: "field_installed",
  fieldOperational: "field_operational",
  opStatus: "op_status",
  hasMaintPlan: "has_maint_plan",
  planFollowed: "plan_followed",
  failureFree: "failure_free",
  maintStatus: "maint_status",
  hasContingency: "has_contingency",
  contingencyDesc: "contingency_desc",
  evidenceCode: "evidence_code",
  degradationDesc: "degradation_desc",
  extraComments: "extra_comments",
};

// mergeOwnership: PATCH-edited keys join the owned set, released keys leave
// it. Sanitizes stored values (drops anything outside the ownable set) and
// sorts for a stable wire shape.
export function mergeOwnership(
  current: readonly string[],
  edited: readonly string[],
  released: readonly string[],
): string[] {
  const next = new Set<string>();
  for (const k of current) if (isOwnableField(k)) next.add(k);
  for (const k of edited) if (isOwnableField(k)) next.add(k);
  for (const k of released) next.delete(k);
  return [...next].sort();
}

export interface FracttalSource {
  // Short Fracttal-side name shown under the field label in the editor.
  field: string;
  // Where exactly the sync derives the value from (tooltip).
  hint: string;
}

// FRACTTAL_SOURCES: where to fix each field at the source. Derived-from
// entries (status/work/heuristics) have no single Fracttal field to edit -
// the caption says so instead of pointing at a wrong column. field_1..field_6
// labels are API names: the Fracttal UI labels for custom fields are not in
// the survey (docs/FRACTTAL-FIELD-SURVEY.md), confirm them with the operator.
export const FRACTTAL_SOURCES: Record<OwnableFieldKey, FracttalSource> = {
  tag: {
    field: "Descrição do ativo",
    hint: "Fracttal usa a descrição; sem ela, o código do ativo",
  },
  locationId: {
    field: "Hierarquia (pai)",
    hint:
      "Fracttal: segmento da estação no parent_description; alternativa: código de localização",
  },
  typologyId: {
    field: "Hierarquia (pai)",
    hint: "Fracttal: tipologia deduzida da hierarquia (parent_description)",
  },
  categoryId: {
    field: "Tipo de equipamento",
    hint: "Fracttal: groups_description",
  },
  groupingId: {
    field: "Derivado (regra local)",
    hint:
      "Sem campo direto no Fracttal: agrupamento deduzido por heurística local",
  },
  ownerId: {
    field: "Derivado (regra local)",
    hint: "Sem campo direto no Fracttal: dono deduzido por heurística local",
  },
  criticalityId: {
    field: "Letra do TAG + ESO",
    hint: "Fracttal: letra do sufixo na descrição e groups_2_description (ESO)",
  },
  comments: {
    field: "OS/SS abertas",
    hint: "Fracttal: nota do status derivada dos eventos de trabalho abertos",
  },
  actionPlan: {
    field: "OS/SS (nota da tarefa)",
    hint: "Fracttal: task_note / observation da corretiva aberta",
  },
  origin: {
    field: "Notas do ativo",
    hint: "Fracttal: notes (regex HAZOP/APR/SGI-LEC/SGSO)",
  },
  installLocal: {
    field: "Hierarquia (pai)",
    hint: "Fracttal: nível da hierarquia acima do ativo (parent_description)",
  },
  equipTypology: {
    field: "Campo personalizado 1",
    hint: "Fracttal: field_1; alternativas: groups_description, descrição",
  },
  fieldInstalled: {
    field: "Ativo + hierarquia",
    hint: "Fracttal: flag active; hierarquia com reserva/estoque/sucata",
  },
  fieldOperational: {
    field: "Derivado do status",
    hint: "Acompanha a disponibilidade derivada; corrija as OS/SS no Fracttal",
  },
  opStatus: {
    field: "Derivado do status",
    hint: "Acompanha a disponibilidade derivada; corrija as OS/SS no Fracttal",
  },
  hasMaintPlan: {
    field: "Grupo de tarefas",
    hint:
      "Fracttal: plano de manutenção (id_group_task / groups_tasks_description / field_6)",
  },
  planFollowed: {
    field: "OS preventivas",
    hint: "Fracttal: datas das ordens preventivas abertas",
  },
  failureFree: {
    field: "OS/SS corretivas",
    hint: "Fracttal: sinal de corretiva urgente nas ordens/solicitações",
  },
  maintStatus: {
    field: "Derivado do status",
    hint: "Acompanha a disponibilidade derivada; corrija as OS/SS no Fracttal",
  },
  hasContingency: {
    field: "OS/SS (texto)",
    hint: "Fracttal: sinal GM/CEC/contingência no texto das OS/SS",
  },
  contingencyDesc: {
    field: "OS/SS (fonte)",
    hint: "Fracttal: origem do sinal de contingência (folio + descrição)",
  },
  evidenceCode: {
    field: "Notas do ativo",
    hint: "Fracttal: código GM/CEC extraído das notas",
  },
  degradationDesc: {
    field: "OS/SS abertas",
    hint: "Fracttal: evento corretivo aberto (folio + descrição)",
  },
  extraComments: {
    field: "Notas + campos",
    hint: "Fracttal: notes, field_6 e colunas técnicas (field_2/3/4)",
  },
};
