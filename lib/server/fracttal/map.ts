// Fracttal -> app barrier mapping (P3, converged Phase 0). Pure
// label-to-id resolution: upstream rows arrive as taxonomy labels, but the
// DB contract is numeric enum ids (lib/enums.ts). Domain rules (scope,
// station, typology, availability precedence) live in ./barrier-rules.ts so
// the dump import and the live sync can never diverge again; this module
// only resolves labels against the context and SKIPS (with a reason)
// anything unmapped - never guesses a plausible id. Field choices mirror
// the import exactly (scripts/fracttal-import.ts pass A): scope and
// category read groups_description (groups_1_description is the polo/area
// upstream, never the category), and the station is the L2 parse of
// parent_description with the raw location_code as fallback (live
// location_code values are group/asset tags, never station codes). The sync
// never creates catalog rows: the import owns locations/categories, unknown
// labels here skip and are listed in the run report.
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  categoryFor,
  CRITICALITY_DEFAULT,
  exclusionReason,
  isBarrierCandidate,
  isoDate,
  resolveAvailability,
  stationCodeOf,
  type StatusEvent,
  tagFor,
  typologyIdOf,
} from "./barrier-rules.ts";

export { AVAILABILITY_AVAILABLE, AVAILABILITY_UNAVAILABLE };

import type { FracttalAsset } from "./types.ts";

// IMPORT_DEFAULTS: fields Fracttal does not carry, given stable documented
// application defaults (review team decision, not silent guess).
export const IMPORT_DEFAULTS = {
  typologyId: 3, // 'Base Operacional'
  groupingId: 0, // 'Sistemas de Alívio'
  locDescId: 0, // 'Próx. ao Separador de Teste'
  ownerId: null as number | null,
};

// MapContext: label -> numeric id lookups. The sync service builds these
// from the lookup tables (which the import owns); tests inject fixtures.
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
  | { ok: true; input: SyncBarrierInput; warnings: string[] }
  | { ok: false; reason: string };

// MapOptions: work events feed the shared derivation (live work orders /
// requests merged per code; until Phase 1 callers pass none and the asset
// flag is the only live signal) and today pins status_since for tests.
export interface MapOptions {
  work?: {
    urgent?: StatusEvent | null;
    planned?: StatusEvent | null;
    stopAssets?: boolean;
  } | null;
  today?: string;
}

// availabilityFromAsset: asset-flag-only derivation (no work events). An
// asset flagged unavailable maps to unavailable, the documented P3 draft
// for the bare flag; stopped/out-of-service dates map to out-of-service.
export function availabilityFromAsset(
  a: FracttalAsset,
  today = new Date().toISOString().slice(0, 10),
): number {
  return resolveAvailability(
    {
      urgent: null,
      planned: null,
      stopAssets: false,
      outOfServiceDate: isoDate(a.initial_date_out_of_service),
      assetAvailable: a.available ?? null,
    },
    today,
  ).availabilityId;
}

// mapAsset: resolve one upstream row to a SyncBarrierInput, or a skip
// reason. Criticality defaults (with a warning) instead of skipping:
// upstream priorities are almost entirely null and the import owns that
// default. Everything else unknown still skips and is listed.
export function mapAsset(
  asset: FracttalAsset,
  ctx: MapContext,
  options: MapOptions = {},
): MappedRow {
  const code = (asset.code ?? "").trim();
  if (code === "") return { ok: false, reason: "empty external_code" };
  const excluded = exclusionReason(code);
  if (excluded !== null) {
    return { ok: false, reason: `excluded asset (${excluded})` };
  }

  // Scope and category read groups_description only, mirroring the import's
  // keyword scope on the same label family (the import checks scope before
  // station too, so skip reasons agree). groups_1_description is the polo
  // and is never consulted: preferring it scoped every live row out.
  const categoryLabel = categoryFor(asset.groups_description);
  if (!isBarrierCandidate(categoryLabel)) {
    return { ok: false, reason: `not barrier scope ('${categoryLabel}')` };
  }

  const stationLabel = stationCodeOf(asset.parent_description);
  const locationCode = (asset.location_code ?? "").trim().toUpperCase();
  // Parent parse wins whenever it resolves (the import assigns stations the
  // same way, so local and remote rows agree); the raw code covers rows
  // without a parent chain. Either miss skips and is listed.
  const locationId =
    (stationLabel !== "" ? ctx.locationIds[stationLabel] : undefined) ??
      (locationCode !== "" ? ctx.locationIds[locationCode] : undefined);
  if (locationId === undefined) {
    return {
      ok: false,
      reason: `unknown station '${stationLabel || locationCode || "<none>"}'`,
    };
  }

  const categoryId = ctx.categoryIds[categoryLabel];
  if (categoryId === undefined) {
    return { ok: false, reason: `unmapped category '${categoryLabel}'` };
  }

  const prioridadeLabel = (asset.priorities_description ?? "").trim();
  const warnings: string[] = [];
  let criticalityId = prioridadeLabel !== ""
    ? ctx.criticalityIds[prioridadeLabel]
    : undefined;
  if (criticalityId === undefined) {
    criticalityId = CRITICALITY_DEFAULT;
    warnings.push(
      `defaulted criticality '${prioridadeLabel || "<none>"}' to 'Não Crítica'`,
    );
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const work = options.work ?? null;
  const outOfServiceDate = isoDate(asset.initial_date_out_of_service);
  const status = resolveAvailability(
    {
      urgent: work?.urgent ?? null,
      planned: work?.planned ?? null,
      stopAssets: work?.stopAssets ?? false,
      outOfServiceDate,
      assetAvailable: asset.available ?? null,
    },
    today,
  );

  return {
    ok: true,
    warnings,
    input: {
      externalCode: code,
      tag: tagFor(asset.description, code),
      locationId,
      typologyId: asset.parent_description
        ? typologyIdOf(asset.parent_description)
        : IMPORT_DEFAULTS.typologyId,
      locDescId: IMPORT_DEFAULTS.locDescId,
      criticalityId,
      categoryId,
      groupingId: IMPORT_DEFAULTS.groupingId,
      ownerId: IMPORT_DEFAULTS.ownerId,
      availabilityId: status.availabilityId,
      comments: status.note,
      actionPlan: "",
      // sourceUpdatedAt is the best remote state signal: the winning work
      // event date, else the out-of-service date, else unknown (null).
      sourceUpdatedAt: work?.urgent?.date ?? work?.planned?.date ??
        outOfServiceDate,
    },
  };
}
