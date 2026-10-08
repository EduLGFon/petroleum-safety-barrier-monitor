// API: GET /api/sync-status - sync pipeline indicator for the dashboard.
// This is why it exists: the dashboard needs to show whether a sync is
// running, when the last one finished, and what it did - without exposing
// sync internals. Authenticated GET (run notes name asset codes).
import {
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getSyncStatus } from "../../lib/server/sql/sync.ts";

import {
  authStoreUnavailable,
  denyDataAuth,
  requireDataAuth,
} from "../../lib/server/auth.ts";

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
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      // Session-store outage (DB blip after the pool retry gave up): 503
      // with Retry-After so the dashboard backs off instead of reading a
      // 401 and dropping the user to login.
      return authStoreUnavailable("GET /api/sync-status", err, requestId);
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);

    try {
      return ok(await getSyncStatus(), requestId);
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
