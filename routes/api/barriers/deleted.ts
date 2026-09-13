// API: GET /api/barriers/deleted - soft-deleted rows for admins.
// This is why it exists: P3 soft-deletes instead of dropping rows, which
// requires an audit path - default views hide deleted rows and offer no
// flag to show them, so this token-guarded listing is the only way to see
// what sync retired. Same filters and shape as /api/barriers; every item
// in it is deleted by construction.
import {
  internal,
  newRequestId,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../../lib/server/throttle.ts";

import { parseDateParam, parseIntParam, parseQueryParam } from "../_params.ts";

import { listBarriers } from "../../../lib/server/sql/barriers.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import type { BarriersQuery } from "../../../lib/wireTypes.ts";

import { checkAdminAuth } from "../../../lib/server/auth.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // GET paged deleted barriers; 401 without a valid ADMIN_TOKEN.
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
    const auth = checkAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/barriers/deleted",
        err,
        requestId,
        "Server misconfigured",
      );
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
      includeDeleted: true,
    };

    try {
      const data = await listBarriers(query);
      return Response.json(data);
    } catch (err) {
      return internal(
        "GET /api/barriers/deleted",
        err,
        requestId,
        "Failed to fetch deleted barriers",
      );
    }
  },
});
