// API: GET /api/kpi - KPI snapshot over the current filters.
// This is why it exists: Fresh port of the Next route; the snapshot honors
// the same filter subset as the table (location, availability, compliance,
// category, criticality, action-plan presence, text, dates) so the header
// never disagrees with the grid.
// Authenticated GET (session or ADMIN_TOKEN); anonymous gets 404.
import {
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { requireDataAuth } from "../../lib/server/auth.ts";

import { getKpi } from "../../lib/server/sql/barriers.ts";

import { parseFilterQuery } from "./_params.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET KPI snapshot for the given filters (all omitted = everything).
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
      return internal("GET /api/kpi", err, requestId, "Server misconfigured");
    }
    const dataAuth = await requireDataAuth(ctx.req);
    if (!dataAuth.ok) {
      return dataAuth.anonymous
        ? notFound("not found", requestId)
        : unauthorized(dataAuth.message, requestId);
    }

    const filter = parseFilterQuery(ctx.url.searchParams);

    try {
      const snapshot = await getKpi(filter);
      return Response.json(snapshot);
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
