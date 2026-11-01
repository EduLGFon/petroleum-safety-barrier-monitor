// Route query params - strict parsers shared by API routes.
// This is why it exists: one validation policy (integers only, ISO dates,
// trimmed/capped text) instead of per-route copies drifting apart. Files
// starting with _ are never routes in Fresh, so this is import-only.
import type { RowScope } from "../../lib/wireTypes.ts";

// Parses optional integer query param; undefined for missing/malformed.
// Rejects floats, negatives are left to SQL clamping per field.
export function parseIntParam(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  if (!/^-?\d+$/.test(v.trim())) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

// Parses a comma-separated list of integers (multi-select filters).
// Single value returns a number for backward compat? Keep array when multiple.
export function parseIntArrayParam(
  v: string | null,
): number | number[] | undefined {
  if (v === null || v === "") return undefined;
  const parts = v.split(",").map((x) => x.trim()).filter(Boolean);
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return undefined;
    const n = Number(p);
    if (!Number.isSafeInteger(n)) return undefined;
    nums.push(n);
  }
  if (nums.length === 0) return undefined;
  return nums.length === 1 ? nums[0] : nums;
}

// Parses optional ISO-date param (YYYY-MM-DD); undefined when missing.
// Strict: month 1-12 and day valid for the month (UTC check). Malformed
// values return undefined so callers can answer 400 via hasDateParamError.
export function parseDateParam(v: string | null): string | undefined {
  if (v === null || v === "") return undefined;
  const date = v.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return undefined;
  return date;
}

// hasDateParamError: true when a since/until param was present but failed
// strict validation, so routes can answer 400 instead of silently ignoring.
export function hasDateParamError(sp: URLSearchParams): boolean {
  for (const key of ["since", "until"]) {
    const raw = sp.get(key);
    if (raw !== null && raw !== "" && parseDateParam(raw) === undefined) {
      return true;
    }
  }
  return false;
}

// Trims free text and caps length so a pasted blob cannot become a huge LIKE.
export function parseQueryParam(v: string | null): string | undefined {
  if (v === null) return undefined;
  const trimmed = v.trim().slice(0, 200);
  return trimmed === "" ? undefined : trimmed;
}

// Parses optional boolean query param ("true"/"false"); undefined otherwise.
export function parseBooleanParam(v: string | null): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

// Parses the admin Situacao scope; undefined for missing/unknown values.
export function parseRowScope(v: string | null): RowScope | undefined {
  if (v === "active" || v === "inactive" || v === "deleted" || v === "all") {
    return v;
  }
  return undefined;
}

// Reads the shared barrier filter subset (location, availability,
// compliance, category, criticality, critical-tiers gate, action-plan
// presence, text, dates, row visibility scope) that list, KPI, chart, and
// export all honor; paging/sort stay per-route so caps differ honestly.
export function parseFilterQuery(sp: URLSearchParams): {
  locationId?: number;
  availabilityId?: number | number[];
  complianceId?: number | number[];
  categoryId?: number | number[];
  typologyId?: number | number[];
  criticalityId?: number | number[];
  criticalOnly?: boolean;
  hasActionPlan?: boolean;
  query?: string;
  since?: string;
  until?: string;
  rowScope?: RowScope;
} {
  return {
    locationId: parseIntParam(sp.get("locationId")),
    availabilityId: parseIntArrayParam(sp.get("availabilityId")),
    complianceId: parseIntArrayParam(sp.get("complianceId")),
    categoryId: parseIntArrayParam(sp.get("categoryId")),
    typologyId: parseIntArrayParam(sp.get("typologyId")),
    criticalityId: parseIntArrayParam(sp.get("criticalityId")),
    criticalOnly: parseBooleanParam(sp.get("criticalOnly")),
    hasActionPlan: parseBooleanParam(sp.get("hasActionPlan")),
    query: parseQueryParam(sp.get("query")),
    since: parseDateParam(sp.get("since")),
    until: parseDateParam(sp.get("until")),
    rowScope: parseRowScope(sp.get("rowScope")),
  };
}
