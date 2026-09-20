// API: GET /api/chart - per-category Conforme totals over the filters.
// This is why it exists: Fresh port for the server-paginated dashboard; the
// chart honors the same filter subset as the table so it never disagrees
// with the grid. Authenticated GET (session or ADMIN_TOKEN); throttled.
import {
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getChartData } from "../../lib/server/sql/chart.ts";

import { requireDataAuth } from "../../lib/server/auth.ts";

import { parseFilterQuery } from "./_params.ts";

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
    const dataAuth = await requireDataAuth(ctx.req);
    if (!dataAuth.ok) {
      return dataAuth.anonymous
        ? notFound("not found", requestId)
        : unauthorized(dataAuth.message, requestId);
    }

    const filter = parseFilterQuery(ctx.url.searchParams);

    try {
      const rows = await getChartData(filter);
      return Response.json(rows);
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
