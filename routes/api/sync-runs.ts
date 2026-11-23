// API: GET /api/sync-runs - recent finished sync runs for the picker.
// This is why it exists: the change-details modal pins "last sync" to an
// explicit run id instead of guessing from history timestamps.
import {
  authStoreUnavailable,
  denyDataAuth,
  requireDataAuth,
} from "../../lib/server/auth.ts";

import {
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { getSyncRuns } from "../../lib/server/sql/sync.ts";

import { parseIntParam } from "./_params.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET recent finished runs (newest first). ?limit= 1..50, default 10.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/sync-runs",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/sync-runs", err, requestId);
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);
    let take = 10;
    try {
      const raw = new URL(ctx.req.url).searchParams.get("limit");
      if (raw !== null && raw !== "") {
        // Strict parse: only a whole decimal number is a limit. "12abc",
        // "0x10", "1e2" and "NaN" are not numbers the caller may have meant,
        // so they fall back to the default instead of silently becoming 12,
        // 16 or 100.
        const parsed = parseIntParam(raw);
        take = parsed === undefined ? 10 : Math.max(1, Math.min(50, parsed));
      }
    } catch {
      // Malformed URL: fall back to the default limit.
    }
    try {
      return okWithEtag(ctx.req, { runs: await getSyncRuns(take) }, requestId);
    } catch (err) {
      return internal(
        "GET /api/sync-runs",
        err,
        requestId,
        "Failed to fetch sync runs",
      );
    }
  },
});
