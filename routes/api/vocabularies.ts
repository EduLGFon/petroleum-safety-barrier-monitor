// API: GET /api/vocabularies - filter vocabularies for refresh cadence.
// This is why it exists: the dashboard SSRs vocabularies once, but the
// auto-refresh tick refetches them so new stations/categories appear
// without a full page reload. Open GET like the other dashboard reads.
import {
  internal,
  newRequestId,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { getVocabularies } from "../../lib/server/sql/vocabularies.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET the current filter vocabularies (id-bearing locations/categories).
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
        "GET /api/vocabularies",
        err,
        requestId,
        "Server misconfigured",
      );
    }

    try {
      return Response.json(await getVocabularies());
    } catch (err) {
      return internal(
        "GET /api/vocabularies",
        err,
        requestId,
        "Failed to fetch vocabularies",
      );
    }
  },
});
