// API: GET /api/barriers - paged wire barrier list.
// This is why it exists: Fresh port of the Next route with the same
// BarriersQuery contract (see lib/wireTypes.ts) for the http adapter.
// Authenticated GET (session or ADMIN_TOKEN); anonymous gets 404
// camouflage, invalid credentials get 401. Throttled, envelope errors.
import {
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import { parseDateParam, parseIntParam, parseQueryParam } from "./_params.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { listBarriers } from "../../lib/server/sql/barriers.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import type { BarriersQuery } from "../../lib/wireTypes.ts";

import { requireDataAuth } from "../../lib/server/auth.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET paged barriers matching BarriersQuery filters; envelope 500 on DB failure.
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
        "GET /api/barriers",
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

    const sp = ctx.url.searchParams;
    const query: BarriersQuery = {
      locationId: parseIntParam(sp.get("locationId")),
      availabilityId: parseIntParam(sp.get("availabilityId")),
      complianceId: parseIntParam(sp.get("complianceId")),
      categoryId: parseIntParam(sp.get("categoryId")),
      query: parseQueryParam(sp.get("query")),
      since: parseDateParam(sp.get("since")),
      until: parseDateParam(sp.get("until")),
      page: parseIntParam(sp.get("page")),
      pageSize: parseIntParam(sp.get("pageSize")),
      sortCol: sp.get("sortCol") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
    };

    try {
      const data = await listBarriers(query);
      return Response.json(data);
    } catch (err) {
      return internal(
        "GET /api/barriers",
        err,
        requestId,
        "Failed to fetch barriers",
      );
    }
  },
});
