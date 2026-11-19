// API: GET /api/alert-rules/preview - test a rule draft before saving.
// This is why it exists: admins tune multi-select scopes blind without a
// dry-run count, so this read-only endpoint counts barriers matching the
// scope filters (current state, not transitions) plus an optional stale
// age gate. Admin auth, same throttle as the rules listing.
import {
  badRequest,
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../lib/server/auth.ts";

import { readThrottle, routeClientKey } from "../../../lib/server/throttle.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { parsePositiveIntParam } from "../_params.ts";

import { queryRows } from "../../../lib/server/db.ts";

import { define } from "../../../utils.ts";

// parseIds: comma list of strict positive integers. Blank entries are
// skipped; anything that is not a whole decimal number is rejected by
// hasInvalidIds before this runs.
function parseIds(value: string | null): number[] | null {
  if (value === null || value.trim() === "") return null;
  const ids: number[] = [];
  for (const part of value.split(",")) {
    const t = part.trim();
    if (t === "") continue;
    const n = parsePositiveIntParam(t);
    if (n === undefined) continue;
    ids.push(n);
  }
  return ids.length > 0 ? ids : null;
}

// hasInvalidIds: true when a comma list holds a zero, negative, or
// non-numeric token. Such scopes never match a real row, so the route
// answers 400 instead of silently counting the unfiltered table. Blank
// entries (",", "1,,2") are skipped, matching parseIds.
function hasInvalidIds(value: string | null): boolean {
  if (value === null || value.trim() === "") return false;
  const parts = value.split(",");
  for (const p of parts) {
    const t = p.trim();
    if (t === "") continue;
    if (parsePositiveIntParam(t) === undefined) return true;
  }
  return false;
}

export const handler = define.handlers({
  // GET - ?categoryIds=1,2&locationIds=3&staleDays=7... -> { count, tags }.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/alert-rules/preview",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "GET /api/alert-rules/preview",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    try {
      const q = ctx.url.searchParams;
      for (
        const key of [
          "categoryIds",
          "locationIds",
          "criticalityIds",
          "typologyIds",
          "groupingIds",
          "ownerIds",
        ]
      ) {
        if (hasInvalidIds(q.get(key))) {
          return badRequest(`${key} must be positive integers`, requestId);
        }
      }
      const categoryIds = parseIds(q.get("categoryIds"));
      const locationIds = parseIds(q.get("locationIds"));
      const criticalityIds = parseIds(q.get("criticalityIds"));
      const typologyIds = parseIds(q.get("typologyIds"));
      const groupingIds = parseIds(q.get("groupingIds"));
      const ownerIds = parseIds(q.get("ownerIds"));
      const staleDaysRaw = q.get("staleDays");
      let staleDays: number | null = null;
      if (staleDaysRaw !== null && staleDaysRaw !== "") {
        // Strict parse: only a whole decimal number is a day count, so
        // "1e2", "0x10" and "7.5" are rejected instead of being
        // reinterpreted as 100, 16 and 8.
        const parsed = parsePositiveIntParam(staleDaysRaw);
        if (parsed === undefined) {
          return badRequest("staleDays must be a positive integer", requestId);
        }
        staleDays = parsed;
      }
      const onlyNoPlan = q.get("onlyNoActionPlan") === "1";
      const filters: string[] = [
        "b.deleted_at is null",
        "coalesce(b.is_active, true)",
      ];
      const args: unknown[] = [];
      const eq = (col: string, ids: number[] | null) => {
        if (!ids) return;
        args.push(ids);
        filters.push(`${col} = any ($${args.length}::int[])`);
      };
      eq("b.category_id", categoryIds);
      eq("b.location_id", locationIds);
      eq("b.criticality_id", criticalityIds);
      eq("b.typology_id", typologyIds);
      eq("b.grouping_id", groupingIds);
      eq("b.owner_id", ownerIds);
      if (staleDays !== null) {
        args.push(staleDays);
        filters.push(
          `b.compliance_id = 1 and b.status_since <= (current_date - ($${args.length}::int * interval '1 day'))`,
        );
      }
      if (onlyNoPlan) {
        filters.push(
          `coalesce(nullif(btrim(b.action_plan), ''), null) is null`,
        );
      }
      const where = `where ${filters.join(" and ")}`;
      const counted = await queryRows<{ n: string }>(
        `select count(*)::text as n from barriers b ${where}`,
        args,
      );
      const sample = await queryRows<{ tag: string }>(
        `select b.tag from barriers b ${where} order by b.id limit 5`,
        args,
      );
      return okWithEtag(ctx.req, {
        count: Number(counted[0]?.n ?? 0),
        tags: sample.map((r) => r.tag),
      }, requestId);
    } catch (err) {
      return internal(
        "GET /api/alert-rules/preview",
        err,
        requestId,
        "Failed to preview rule",
      );
    }
  },
});
