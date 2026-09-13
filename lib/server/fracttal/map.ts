// Fracttal -> app barrier mapping (P3). Pure label-to-id resolution.
// This is why it exists: upstream rows arrive as taxonomy labels, but the DB
// contract is numeric enum ids (lib/enums.ts). The mapper resolves labels
// exactly and SKIPS (with a reason) anything unmapped - never guesses a
// plausible id - per the mapped/unmapped discipline set in docs/FRACTTAL.md.
import type { FracttalAsset } from "./types.ts";

// AVAILABILITY_AVAILABLE / AVAILABILITY_UNAVAILABLE: reference the two stable
// ids the provisional availability rule can emit (docs/FRACTTAL.md mapping draft).
export const AVAILABILITY_AVAILABLE = 0;
export const AVAILABILITY_UNAVAILABLE = 5;

// IMPORT_DEFAULTS: fields Fracttal does not carry, given stable documented
// application defaults (review team decision, not silent guess).
export const IMPORT_DEFAULTS = {
  typologyId: 3, // 'Base Operacional'
  groupingId: 0, // 'Sistemas de Alívio'
  locDescId: 0, // 'Próx. ao Separador de Teste'
  ownerId: null as number | null,
};

// MapContext: label -> numeric id lookups. The sync service builds these
// from the seeded lookup tables; tests inject fixtures.
export interface MapContext {
  locationIds: Record<string, number>;
  categoryIds: Record<string, number>;
  criticalityIds: Record<string, number>;
}

// SyncBarrierInput: one fully-resolved row ready for the upsert planner.
export interface SyncBarrierInput {
  externalCode: string;
  tag: string;
  locationId: number;
  typologyId: number;
  locDescId: number;
  criticalityId: number;
  categoryId: number;
  groupingId: number;
  ownerId: number | null;
  availabilityId: number;
  comments: string;
  actionPlan: string;
  sourceUpdatedAt: string | null;
}

export type MappedRow =
  | { ok: true; input: SyncBarrierInput }
  | { ok: false; reason: string };

// availabilityFromAsset: provisional rule - an asset not available is
// 'Indisponível', otherwise 'Disponível'. Contingent/degraded buckets need a
// secondary signal (work orders) and are UNMAPPED for now.
export function availabilityFromAsset(a: FracttalAsset): number {
  return a.available === false
    ? AVAILABILITY_UNAVAILABLE
    : AVAILABILITY_AVAILABLE;
}

// mapAsset: resolve one upstream row to a SyncBarrierInput, or a skip reason.
export function mapAsset(asset: FracttalAsset, ctx: MapContext): MappedRow {
  const code = (asset.code ?? "").trim();
  if (code === "") return { ok: false, reason: "empty external_code" };

  const locationCode = (asset.location_code ?? "").trim().toUpperCase();
  const locationId = locationCode !== ""
    ? ctx.locationIds[locationCode]
    : undefined;
  if (locationId === undefined) {
    return {
      ok: false,
      reason: `unknown location '${locationCode || "<none>"}'`,
    };
  }

  // Category: prefer the most specific groups_1 label (tenant taxonomy);
  // fall back to groups_description. Unknown labels are listed, not forced.
  const categoryLabel =
    (asset.groups_1_description ?? asset.groups_description ?? "")
      .trim();
  const categoryId = categoryLabel !== ""
    ? ctx.categoryIds[categoryLabel]
    : undefined;
  if (categoryId === undefined) {
    return { ok: false, reason: `unmapped category '${categoryLabel}'` };
  }

  // Criticality: 'Crítico'/'Não Crítica' exact labels; anything else skips.
  const prioridadeLabel = (asset.priorities_description ?? "").trim();
  const criticalityId = prioridadeLabel !== ""
    ? ctx.criticalityIds[prioridadeLabel]
    : undefined;
  if (criticalityId === undefined) {
    return { ok: false, reason: `unmapped criticality '${prioridadeLabel}'` };
  }

  return {
    ok: true,
    input: {
      externalCode: code,
      tag: code, // upstream code doubles as the display tag initially
      locationId,
      typologyId: IMPORT_DEFAULTS.typologyId,
      locDescId: IMPORT_DEFAULTS.locDescId,
      criticalityId,
      categoryId,
      groupingId: IMPORT_DEFAULTS.groupingId,
      ownerId: IMPORT_DEFAULTS.ownerId,
      availabilityId: availabilityFromAsset(asset),
      comments: "",
      actionPlan: "",
      sourceUpdatedAt: null,
    },
  };
}
