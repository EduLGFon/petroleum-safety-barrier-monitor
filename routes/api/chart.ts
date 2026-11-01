// API: GET /api/chart - per-category Conforme totals over the filters.
// This is why it exists: Fresh port for the server-paginated dashboard; the
// chart honors the same filter subset as the table so it never disagrees
// with the grid. Authenticated GET (session or ADMIN_TOKEN); throttled.
import {
  badRequest,
  forbidden,
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyDataAuth,
  requireDataAuth,
  resolveAllowedLocationIds,
} from "../../lib/server/auth.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getChartData } from "../../lib/server/sql/chart.ts";

import { memoGetOrCompute, scopeKey } from "../../lib/server/cache.ts";

import { hasDateParamError, parseFilterQuery } from "./_params.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET chart rows for the given filters (all omitted = everything).
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited(
        "too many requests",
        requestId,
        limit.retryAfterMs,
      );
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/chart",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/chart", err, requestId);
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);

    const filter = {
      ...parseFilterQuery(ctx.url.searchParams),
      allowedLocationIds: resolveAllowedLocationIds(dataAuth),
    };
    if (hasDateParamError(ctx.url.searchParams)) {
      return badRequest("Invalid date param", requestId);
    }
    if (
      (filter.rowScope === "deleted" || filter.rowScope === "all") &&
      dataAuth.role !== "admin"
    ) {
      return forbidden("admin only", requestId);
    }

    try {
      // 30s memo like KPI: chart ticks share one aggregation.
      const key = scopeKey(["chart", dataAuth.role, JSON.stringify(filter)]);
      const rows = await memoGetOrCompute(
        key,
        30_000,
        () => getChartData(filter),
      );
      return okWithEtag(ctx.req, rows, requestId);
    } catch (err) {
      return internal(
        "GET /api/chart",
        err,
        requestId,
        "Failed to fetch chart data",
      );
    }
  },
});
