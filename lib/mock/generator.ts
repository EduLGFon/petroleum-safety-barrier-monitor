// Deterministic mock WireBarrier dataset generator with cache - split from lib/data.ts to keep files small; why: assembles the full mock API payload from rng/tags/history pieces.
import {
  CATEGORY_CODES,
  GROUPING_CODES,
  LOC_DESC_CODES,
  OWNER_CODES,
  TYPOLOGY_CODES,
} from "../enums.ts";
import { ACTION_PLANS, COMMENTS, generateHistory } from "./history.ts";
import { LOCATION_DIST_BY_ID, LOCATIONS } from "../constants.ts";
import type { WireBarrier } from "../wireTypes.ts";
import { genSheetFields } from "./sheet-fields.ts";
import { createRng } from "./rng.ts";
import { buildTag } from "./tags.ts";

// ─── Status distribution (id-keyed) ──────────────────────────────────────
// 0=available 1=out-of-service 2=contingency-outage 3=degraded-contingency 4=degraded 5=unavailable

const STATUS_DIST: [number, number][] = [
  [0, 0.52],
  [1, 0.14],
  [2, 0.08],
  [3, 0.07],
  [4, 0.12],
  [5, 0.07],
];
export { STATUS_DIST };

// Picks a status id from STATUS_DIST cumulative probabilities.
export function pickStatusId(r: number): number {
  let cum = 0;
  for (const [id, p] of STATUS_DIST) {
    cum += p;
    if (r < cum) return id;
  }
  return 0;
}

// ─── Generator ────────────────────────────────────────────────────────────

let _cache: WireBarrier[] | null = null;

// Generates (once, cached) the deterministic mock WireBarrier[] dataset.
export function getWireBarriers(): WireBarrier[] {
  if (_cache) return _cache;

  const rng = createRng(0xdeadbeef);
  const barriers: WireBarrier[] = [];
  let id = 1;

  // Seed display names for locationName (server joins locations instead).
  const locNames = new Map(LOCATIONS.map((l) => [l.code, l.name]));

  const catCount = Object.keys(CATEGORY_CODES).length;
  const typCount = Object.keys(TYPOLOGY_CODES).length;
  const grpCount = Object.keys(GROUPING_CODES).length;
  const ownerCount = Object.keys(OWNER_CODES).length;
  const locDescCount = Object.keys(LOC_DESC_CODES).length;

  for (const loc of LOCATION_DIST_BY_ID) {
    const locCode = loc.code; // e.g. 'FAL' - used only for TAG text, not stored

    for (let i = 0; i < loc.count; i++) {
      const categoryId = rng.int(0, catCount);
      const availabilityId = pickStatusId(rng.next());
      const { history, statusSince } = generateHistory(rng, availabilityId);

      const hasOwner = rng.bool(0.65);
      const isNC = ![0, 1, 2, 3].includes(availabilityId); // matches isCompliant logic by id
      const hasAction = isNC && rng.bool(0.4);
      const sheet = genSheetFields(rng);

      barriers.push({
        id,
        tag: buildTag(categoryId, rng, locCode),
        typologyId: rng.int(0, typCount),
        locationId: loc.id,
        locDescId: rng.int(0, locDescCount),
        // Sheet inventory is 100% critical barriers - mock mirrors that.
        criticalityId: 1,
        categoryId,
        groupingId: rng.int(0, grpCount),
        ownerId: hasOwner ? rng.int(0, ownerCount) : -1,
        availabilityId,
        comments: rng.bool(0.15) ? rng.pick(COMMENTS) : "",
        actionPlan: hasAction ? rng.pick(ACTION_PLANS) : "",
        statusSince,
        statusHistory: history,
        // Synthetic Fracttal code (real rows join by external_code instead).
        externalCode: String(rng.int(100000, 1999999)),
        // Display name rides from the seed catalog (server joins locations).
        locationName: locNames.get(locCode) ?? locCode,
        ...sheet,
      });
      id++;
    }
  }

  _cache = barriers;
  return barriers;
}
