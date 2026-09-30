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
// location_code values are group/asset tags, never station codes). Missing
// catalog rows no longer skip: the sync creates them itself (see
// catalogNeeds + SyncIo.ensureCatalog) with exactly the derivation below,
// so a migrate-only database converges to full tenant coverage on the first
// cycle. Unknown criticality ranks still skip: those ids are a hard contract
// with lib/enums, not free-text labels.
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  categoryFor,
  criticalityLabelFor,
  exclusionReason,
  isoDate,
  locationTypeOf,
  resolveAvailability,
  scopeSources,
  stationCodeOf,
  stationNameOf,
  type StatusEvent,
  tagFor,
  typologyIdOf,
} from "./barrier-rules.ts";

export { AVAILABILITY_AVAILABLE, AVAILABILITY_UNAVAILABLE };

import type { FracttalAsset } from "./types.ts";

// IMPORT_DEFAULTS: fields Fracttal does not carry, given stable documented
// application defaults (review team decision, not silent guess). locDescId
// is storage-only (NOT NULL FK): Fracttal carries no location text and the
// UI/exports never display it, so id 0 is a placeholder, not a real place.
export const IMPORT_DEFAULTS = {
  typologyId: 1, // 'Campo'
  groupingId: 0, // 'Sistemas de Alívio'
  locDescId: 0, // storage-only placeholder, never displayed
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
  // Upstream enable flag (Fracttal `active`, default true). False marks a
  // Desativada row; it never changes availability derivation, only the
  // admin Situacao filter visibility.
  isActive: boolean;
  // Scope provenance (keyword / eso / keyword+eso): which gate admitted the
  // row. Rides the sync signature so scope edits rewrite every touched row.
  scopeSource: string;
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

  // Scope is fully open: every equipment row enters the monitor and the
  // admitting gates ride along as scope_source (keyword / eso /
  // keyword+eso / all) for reversibility. groups_1_description is the polo
  // and is never consulted.
  const categoryLabel = categoryFor(asset.groups_description);
  const sources = scopeSources(categoryLabel, asset.groups_2_description);
  const scopeSource = sources.join("+") || "all";

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

  // Criticality rank derives from the TAG suffix letter plus the ESO flag
  // (shared criticalityLabelFor); the sync never invents levels, so a rank
  // missing from the lookup table skips loudly instead of guessing an id.
  // Deploy order matters: db:migrate must seed the ranks before this runs,
  // or every row skips at once (skips never delete, but the run is empty).
  const prioridadeLabel = (asset.priorities_description ?? "").trim();
  const warnings: string[] = [];
  const rank = criticalityLabelFor(
    asset.description,
    asset.groups_2_description,
    asset.priorities_description,
  );
  if (rank.guessed) {
    warnings.push(
      `defaulted criticality '${
        prioridadeLabel || "<none>"
      }' to rank D (unparseable TAG suffix)`,
    );
  }
  const criticalityId = ctx.criticalityIds[rank.label];
  if (criticalityId === undefined) {
    return { ok: false, reason: `unmapped criticality '${rank.label}'` };
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
      // Upstream enable flag; null/unknown means enabled (fail-open to
      // visible, the pre-flag behavior for old fixtures and dumps).
      isActive: asset.active ?? true,
      scopeSource,
    },
  };
}

// CatalogNeeds: the distinct free-text labels one sweep needs present in
// the locations/categories tables. Pure extraction so the IO layer can
// create them before mapping (see SyncIo.ensureCatalog).
export interface CatalogLocationNeed {
  code: string;
  name: string | null;
  type: string;
}

export interface CatalogNeeds {
  categories: string[];
  locations: CatalogLocationNeed[];
}

// catalogNeeds: collect the distinct category labels and station entries a
// batch of assets resolves to, using the exact derivation mapAsset applies
// (parent L2 parse first, raw location_code fallback; first non-null
// display name wins per station, mirroring the import). Rows that can never
// map (empty code, documented exclusions, no station at all) are left out:
// they stay listed as mapping skips, not catalog gaps.
export function catalogNeeds(items: FracttalAsset[]): CatalogNeeds {
  const categories = new Set<string>();
  const locations = new Map<string, CatalogLocationNeed>();
  for (const asset of items) {
    const code = (asset.code ?? "").trim();
    if (code === "" || exclusionReason(code) !== null) continue;
    categories.add(categoryFor(asset.groups_description));
    const stationLabel = stationCodeOf(asset.parent_description);
    if (stationLabel !== "") {
      const existing = locations.get(stationLabel);
      const name = stationNameOf(asset.parent_description);
      if (!existing) {
        locations.set(stationLabel, {
          code: stationLabel,
          name,
          type: locationTypeOf(stationLabel),
        });
      } else if (existing.name == null && name != null) {
        existing.name = name;
      }
      continue;
    }
    const locationCode = (asset.location_code ?? "").trim().toUpperCase();
    if (locationCode === "") continue;
    if (!locations.has(locationCode)) {
      locations.set(locationCode, {
        code: locationCode,
        name: null,
        type: locationTypeOf(locationCode),
      });
    }
  }
  return { categories: [...categories], locations: [...locations.values()] };
}
