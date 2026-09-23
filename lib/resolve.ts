/**
 * ══════════════════════════════════════════════════════════════════════════
 * RESOLVE - converts wire (numeric-id) records into domain objects the UI uses
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  fromAuthorId,
  fromAvailabilityId,
  fromCategoryId,
  fromComplianceId,
  fromCriticalityId,
  fromGroupingId,
  fromLocationId,
  fromLocDescId,
  fromOwnerId,
  fromTypologyId,
} from "./enums.ts";
import type {
  WireBarrier,
  WireCategoryCompliance,
  WireKpiSnapshot,
  WireStatusHistoryEntry,
} from "./wireTypes.ts";
import type {
  Barrier,
  CategoryCompliance,
  StatusHistoryEntry,
} from "./types.ts";
import { isCompliant } from "./constants.ts";
import type { KpiSnapshot } from "./types.ts";

// Maps a wire history entry's numeric IDs to display strings; date/note pass through unchanged.
export function resolveHistoryEntry(
  w: WireStatusHistoryEntry,
  labels?: ResolverLabels,
): StatusHistoryEntry {
  return {
    date: w.date,
    status: fromAvailabilityId(w.statusId),
    author: labels?.authors?.[w.authorId] ?? fromAuthorId(w.authorId),
    note: w.note,
  };
}

// Dynamic id->label overrides for all taxonomy dimensions. Static enums only
// know the seed values; real imported data carries many more, so the server
// sends its actual vocabulary and resolution prefers those maps when present.
export interface ResolverLabels {
  locations?: Record<number, string>;
  categories?: Record<number, string>;
  typologies?: Record<number, string>;
  groupings?: Record<number, string>;
  owners?: Record<number, string>;
  locDescs?: Record<number, string>;
  authors?: Record<number, string>;
}

// Maps numeric wire IDs to Barrier strings; compliance is derived from availability, never trusted from wire. Dynamic labels (when supplied) win over seed enums.
export function resolveBarrier(
  w: WireBarrier,
  labels?: ResolverLabels,
): Barrier {
  const availability = fromAvailabilityId(w.availabilityId);
  return {
    id: w.id,
    tag: w.tag,
    typology: labels?.typologies?.[w.typologyId] ??
      fromTypologyId(w.typologyId),
    location: labels?.locations?.[w.locationId] ?? fromLocationId(w.locationId),
    locDesc: labels?.locDescs?.[w.locDescId] ?? fromLocDescId(w.locDescId),
    criticality: fromCriticalityId(w.criticalityId),
    category: labels?.categories?.[w.categoryId] ??
      fromCategoryId(w.categoryId),
    grouping: labels?.groupings?.[w.groupingId] ??
      fromGroupingId(w.groupingId),
    owner: w.ownerId === -1 && !labels?.owners?.[w.ownerId]
      ? ""
      : labels?.owners?.[w.ownerId] ?? fromOwnerId(w.ownerId),
    availability,
    // Compliance is always DERIVED from availability - never trusted
    // from the wire - so the two values can never disagree.
    compliance: isCompliant(availability) ? "Conforme" : "Não Conforme",
    comments: w.comments,
    actionPlan: w.actionPlan,
    statusSince: w.statusSince,
    statusHistory: w.statusHistory.map((h) => resolveHistoryEntry(h, labels)),
    // Sheet inventory columns travel resolved already (free text, no ids).
    origin: w.origin,
    externalCode: w.externalCode,
    locationName: w.locationName,
    installLocal: w.installLocal,
    equipTypology: w.equipTypology,
    fieldInstalled: w.fieldInstalled,
    fieldOperational: w.fieldOperational,
    opStatus: w.opStatus,
    hasMaintPlan: w.hasMaintPlan,
    planFollowed: w.planFollowed,
    failureFree: w.failureFree,
    maintStatus: w.maintStatus,
    hasContingency: w.hasContingency,
    contingencyDesc: w.contingencyDesc,
    evidenceCode: w.evidenceCode,
    degradationDesc: w.degradationDesc,
    extraComments: w.extraComments,
  };
}

// Maps a wire array to Barrier[] via resolveBarrier; preserves order, empty in → empty out.
export function resolveBarriers(
  items: WireBarrier[],
  labels?: ResolverLabels,
): Barrier[] {
  return items.map((w) => resolveBarrier(w, labels));
}

/** KPI snapshots are already numeric on the wire - pass-through with type narrowing.
 *  Dynamic buckets arrive keyed by numeric id (as string) and are translated
 *  to display-string keys here; already-string keys pass through untouched
 *  for backward compat. syncedAt rides along when present. */
export function resolveKpi(w: WireKpiSnapshot): KpiSnapshot {
  const {
    byAvailability,
    byCompliance,
    byCriticality,
    syncedAt,
    ...fixed
  } = w as WireKpiSnapshot & Partial<KpiSnapshot>;
  // Translates one numeric-id-keyed bucket to display-string keys.
  // Non-numeric keys are kept as-is so old servers keep working.
  const mapBucket = (
    bucket: Record<string, number> | undefined,
    fromId: (id: number) => string,
  ): Record<string, number> | undefined => {
    if (!bucket) return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(bucket)) {
      const n = Number(k);
      const label = k !== "" && Number.isInteger(n) ? fromId(n) : k;
      out[label] = (out[label] ?? 0) + v;
    }
    return out;
  };
  return {
    ...fixed,
    ...(byAvailability
      ? {
        byAvailability: mapBucket(byAvailability, fromAvailabilityId),
      }
      : {}),
    ...(byCompliance
      ? { byCompliance: mapBucket(byCompliance, fromComplianceId) }
      : {}),
    ...(byCriticality
      ? { byCriticality: mapBucket(byCriticality, fromCriticalityId) }
      : {}),
    ...(syncedAt ? { syncedAt } : {}),
  };
}

// Maps wire per-category totals to chart rows; nonCompliant is total minus
// compliant (fail-closed novel handling, same as computeChartData). Names
// stay FULL like the client derivation (truncation is presentation-only in
// ChartRow); SQL order is preserved.
export function resolveChartData(
  items: WireCategoryCompliance[],
  labels?: ResolverLabels,
): CategoryCompliance[] {
  return items.map((w) => {
    const name = labels?.categories?.[w.categoryId] ??
      fromCategoryId(w.categoryId);
    return {
      name,
      Conforme: w.compliant,
      "Não Conforme": Math.max(0, w.total - w.compliant),
    };
  });
}
