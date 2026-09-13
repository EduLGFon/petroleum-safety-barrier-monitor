// API: GET /api/chart - per-category Conforme totals scoped by location.
// This is why it exists: Fresh port for the server-paginated dashboard; omitted
// or 0 locationId means all installations (matches ALL=0 in lib/enums.ts).
// Open GET, throttled, envelope errors.
import {
  internal,
  newRequestId,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getChartData } from "../../lib/server/sql/chart.ts";

import { parseIntParam } from "./_params.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET chart rows for locationId (undefined/0 = all installations).
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

    const raw = ctx.url.searchParams.get("locationId");
    const locationId = parseIntParam(raw);

    try {
      const rows = await getChartData(locationId);
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
