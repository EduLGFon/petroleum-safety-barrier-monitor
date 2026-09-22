// API: GET /api/sync-changes - barriers touched by recent sync runs.
// This is why it exists: the hover card answers "what changed" with real
// items (tag, station, status), not just counts. Authenticated GET with an
// optional ?limit= (1..20, default 8); read-only like /api/sync-status.
import {
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getSyncRecentChanges } from "../../lib/server/sql/sync.ts";

import { requireDataAuth } from "../../lib/server/auth.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET the newest sync-touched barriers (history by the sync author plus
  // recent soft deletes, merged by recency).
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
        "GET /api/sync-changes",
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

    let take = 8;
    try {
      const raw = new URL(ctx.req.url).searchParams.get("limit");
      if (raw !== null) {
        take = Math.max(1, Math.min(20, Number.parseInt(raw, 10) || 8));
      }
    } catch {
      // Malformed URL: fall back to the default limit.
    }

    try {
      return Response.json({ changes: await getSyncRecentChanges(take) });
    } catch (err) {
      return internal(
        "GET /api/sync-changes",
        err,
        requestId,
        "Failed to fetch sync changes",
      );
    }
  },
});
