// Sync field labels - pt-BR names for changed_fields keys.
// This is why it exists: the audit stores SignatureSource keys
// (tag, locationId, ...) plus availabilityId; the UI shows readable labels.
import {
  fromAvailabilityId,
  fromCategoryId,
  fromCriticalityId,
  fromGroupingId,
  fromLocationId,
  fromLocDescId,
  fromOwnerId,
  fromTypologyId,
} from "../../lib/enums.ts";

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

// syncFieldValue: human-readable before/after values for the sync detail.
// Snapshots store numeric ids (typologyId 3, criticalityId 2, ...); raw
// numbers mean nothing to the user, so id fields resolve to their display
// labels. Unknown ids keep the explicit sentinel from the from* helpers
// (never a bare number). Non-id fields pass through; null/undefined → "-".
export function syncFieldValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v !== "number" || !Number.isInteger(v)) {
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  switch (key) {
    case "locationId":
      return fromLocationId(v);
    case "typologyId":
      return fromTypologyId(v);
    case "locDescId":
      return fromLocDescId(v);
    case "criticalityId":
      return fromCriticalityId(v);
    case "categoryId":
      return fromCategoryId(v);
    case "groupingId":
      return fromGroupingId(v);
    case "ownerId":
      return v < 0 ? "-" : fromOwnerId(v);
    case "availabilityId":
      return fromAvailabilityId(v);
    default:
      return String(v);
  }
}
