// Sync field labels - pt-BR names for changed_fields keys.
// This is why it exists: the audit stores SignatureSource keys
// (tag, locationId, ...) plus availabilityId; the UI shows readable labels.
export const SYNC_FIELD_LABELS: Record<string, string> = {
  tag: "Tag",
  locationId: "Instalação",
  typologyId: "Tipologia",
  locDescId: "Local descritivo",
  criticalityId: "Criticidade",
  categoryId: "Categoria",
  groupingId: "Agrupamento",
  ownerId: "Responsável",
  comments: "Comentários",
  actionPlan: "Plano de ação",
  scopeSource: "Origem do escopo",
  availabilityId: "Status",
};

export function syncFieldLabel(key: string): string {
  return SYNC_FIELD_LABELS[key] ?? key;
}
