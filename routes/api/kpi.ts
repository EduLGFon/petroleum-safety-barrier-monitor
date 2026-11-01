// API: GET /api/kpi - KPI snapshot over the current filters.
// This is why it exists: Fresh port of the Next route; the snapshot honors
// the same filter subset as the table (location, availability, compliance,
// category, criticality, action-plan presence, text, dates) so the header
// never disagrees with the grid.
// Authenticated GET (session or ADMIN_TOKEN); anonymous gets 404.
import {
  badRequest,
  forbidden,
  internal,
  okWithEtag,
} from "../../lib/server/errors.ts";

import {
  type DataAuth,
  resolveAllowedLocationIds,
} from "../../lib/server/auth.ts";

import { getKpi } from "../../lib/server/sql/barriers.ts";

import { hasDateParamError, parseFilterQuery } from "./_params.ts";

import { guardRequest } from "../../lib/server/api-guard.ts";

import { memoGetOrCompute, scopeKey } from "../../lib/server/cache.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET KPI snapshot for the given filters (all omitted = everything).
  async GET(ctx) {
    const g = await guardRequest(ctx, {
      kind: "read",
      auth: "data",
      label: "GET /api/kpi",
    });
    if (g.response) return g.response;
    const requestId = g.requestId;
    const dataAuth = g.dataAuth as Extract<DataAuth, { ok: true }>;
    if (hasDateParamError(ctx.url.searchParams)) {
      return badRequest("Invalid date param", requestId);
    }
    const filter = {
      ...parseFilterQuery(ctx.url.searchParams),
      allowedLocationIds: resolveAllowedLocationIds(dataAuth),
    };
    if (
      (filter.rowScope === "deleted" || filter.rowScope === "all") &&
      dataAuth.role !== "admin"
    ) {
      return forbidden("admin only", requestId);
    }

    try {
      // 30s memo keyed by scope + filters: dashboard ticks share one
      // snapshot (and one stable syncedAt, so ETags 304) instead of
      // stampeding Postgres per poll.
      const key = scopeKey(["kpi", dataAuth.role, JSON.stringify(filter)]);
      const snapshot = await memoGetOrCompute(
        key,
        30_000,
        () => getKpi(filter, { scopeCounts: dataAuth.role === "admin" }),
      );
      return await okWithEtag(ctx.req, snapshot, requestId);
    } catch (err) {
      return internal(
        "GET /api/kpi",
        err,
        requestId,
        "Failed to fetch KPI snapshot",
      );
    }
  },
});
