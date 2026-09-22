// API: GET /api/sync-status - sync pipeline indicator for the dashboard.
// This is why it exists: the dashboard needs to show whether a sync is
// running, when the last one finished, and what it did - without exposing
// sync internals. Authenticated GET (run notes name asset codes).
import {
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getSyncStatus } from "../../lib/server/sql/sync.ts";

import { requireDataAuth } from "../../lib/server/auth.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET the current sync state (running/finished/stale) plus run counts.
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
        "GET /api/sync-status",
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

    try {
      return Response.json(await getSyncStatus());
    } catch (err) {
      return internal(
        "GET /api/sync-status",
        err,
        requestId,
        "Failed to fetch sync status",
      );
    }
  },
});
