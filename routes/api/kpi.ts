// API: GET /api/kpi - KPI snapshot scoped by location.
// This is why it exists: Fresh port of the Next route; omitted or 0
// locationId means all installations (matches ALL=0 in lib/enums.ts).
// Open GET, throttled, envelope errors.
import {
  internal,
  newRequestId,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getKpi } from "../../lib/server/sql/barriers.ts";

import { parseIntParam } from "./_params.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET KPI snapshot for locationId (undefined/0 = all installations).
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

    const locationId = parseIntParam(ctx.url.searchParams.get("locationId"));

    try {
      const snapshot = await getKpi(locationId);
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
