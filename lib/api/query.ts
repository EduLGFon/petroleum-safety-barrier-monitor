// API query conversion - domain filters to numeric wire query plus URL encoding.
// This is why it exists: one place for toWireQuery (with unknown-value
// warnings) and buildQueryString, shared by mock and HTTP adapters.
import {
  toAvailabilityId,
  toCategoryId,
  toComplianceId,
  toCriticalityId,
  toLocationId,
  toTypologyId,
} from "../enums.ts";
import type { BarriersQuery } from "../wireTypes.ts";
import type { DomainQuery } from "./types.ts";

// Accepts YYYY-MM-DD (or longer ISO starting with a valid date); else undefined.
export function cleanDateParam(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const date = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

// Dynamic label->id overrides for stations/categories/typologies supplied
// by the server vocabulary; real imported values beyond the seed enums
// still encode.
export interface QueryIdOverrides {
  locationIds?: Record<string, number>;
  categoryIds?: Record<string, number>;
  typologyIds?: Record<string, number>;
}

/** Converts UI-facing string filters into the numeric wire query the API expects.
 *  Unknown vocabulary values are skipped (with a warning) instead of silently
 *  mapping to a wrong known id - the server will learn the new value first.
 *  overrides map dynamic labels to ids when the static enums do not know them. */
export function toWireQuery(
  f: DomainQuery,
  overrides?: QueryIdOverrides,
): BarriersQuery {
  const q: BarriersQuery = {};
  if (f.location && f.location !== "ALL") {
    const id = overrides?.locationIds?.[f.location] ?? toLocationId(f.location);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown location: ${f.location}`);
    } else q.locationId = id;
  }
  if (f.availability) {
    const id = toAvailabilityId(f.availability as never);
    if (id === undefined) {
      console.warn(
        `[toWireQuery] unknown availability: ${f.availability}`,
      );
    } else q.availabilityId = id;
  }
  if (f.compliance) {
    const id = toComplianceId(f.compliance as never);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown compliance: ${f.compliance}`);
    } else q.complianceId = id;
  }
  if (f.category) {
    const id = overrides?.categoryIds?.[f.category] ?? toCategoryId(f.category);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown category: ${f.category}`);
    } else q.categoryId = id;
  }
  if (f.typology) {
    const id = overrides?.typologyIds?.[f.typology] ?? toTypologyId(f.typology);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown typology: ${f.typology}`);
    } else q.typologyId = id;
  }
  if (f.plan === "Com plano") q.hasActionPlan = true;
  else if (f.plan === "Sem plano") q.hasActionPlan = false;
  else if (f.plan) console.warn(`[toWireQuery] unknown plan: ${f.plan}`);
  if (f.criticality) {
    const id = toCriticalityId(f.criticality as never);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown criticality: ${f.criticality}`);
    } else q.criticalityId = id;
  }
  if (f.query) q.query = f.query;
  const since = cleanDateParam(f.since);
  if (since) q.since = since;
  const until = cleanDateParam(f.until);
  if (until) q.until = until;
  if (f.page) q.page = f.page;
  if (f.pageSize) q.pageSize = f.pageSize;
  if (f.sortCol) q.sortCol = f.sortCol;
  if (f.sortDir) q.sortDir = f.sortDir;
  return q;
}

// Serializes wire query to URL search string, skipping empty values.
export function buildQueryString(q: BarriersQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return params.toString();
}
