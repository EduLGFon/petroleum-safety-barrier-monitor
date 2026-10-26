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
  const toIdList = <T>(
    v: string | string[] | undefined,
    resolve: (s: string) => T | undefined,
    label: string,
  ): T[] | undefined => {
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    if (vals.length === 0) return undefined;
    const ids: T[] = [];
    for (const s of vals) {
      const id = resolve(s);
      if (id === undefined) {
        console.warn(`[toWireQuery] unknown ${label}: ${s}`);
      } else ids.push(id);
    }
    return ids.length ? ids : undefined;
  };
  const availIds = toIdList(
    f.availability as string | string[] | undefined,
    (s) => toAvailabilityId(s as never),
    "availability",
  );
  if (availIds) {
    q.availabilityId = availIds.length === 1 ? availIds[0] : availIds;
  }
  const confIds = toIdList(
    f.compliance as string | string[] | undefined,
    (s) => toComplianceId(s as never),
    "compliance",
  );
  if (confIds) q.complianceId = confIds.length === 1 ? confIds[0] : confIds;
  const catIds = toIdList(
    f.category as string | string[] | undefined,
    (s) => overrides?.categoryIds?.[s] ?? toCategoryId(s),
    "category",
  );
  if (catIds) q.categoryId = catIds.length === 1 ? catIds[0] : catIds;
  const typoIds = toIdList(
    f.typology as string | string[] | undefined,
    (s) => overrides?.typologyIds?.[s] ?? toTypologyId(s),
    "typology",
  );
  if (typoIds) q.typologyId = typoIds.length === 1 ? typoIds[0] : typoIds;
  if (f.criticality) {
    // criticality may be a list too; resolve each, keep single for compat
    const critVals = Array.isArray(f.criticality)
      ? f.criticality
      : [f.criticality];
    const critIds = critVals
      .map((s) => toCriticalityId(s as never))
      .filter((x) => x !== undefined) as number[];
    if (critIds.length) {
      q.criticalityId = critIds.length === 1 ? critIds[0] : critIds;
    }
  }
  if (f.plan === "Com plano") q.hasActionPlan = true;
  else if (f.plan === "Sem plano") q.hasActionPlan = false;
  else if (f.plan) console.warn(`[toWireQuery] unknown plan: ${f.plan}`);
  if (f.criticalOnly === true) q.criticalOnly = true;
  if (
    f.rowScope === "active" || f.rowScope === "inactive" ||
    f.rowScope === "deleted" || f.rowScope === "all"
  ) {
    q.rowScope = f.rowScope;
  } else if (f.rowScope !== undefined) {
    console.warn(`[toWireQuery] unknown rowScope: ${f.rowScope}`);
  }
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
