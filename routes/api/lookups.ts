// API: GET /api/lookups - id-bearing option lists for admin UI.
// This is why it exists: status assignment and alert-rule forms need numeric
// ids (not display labels) for availabilities, categories, and authors. The
// public vocabularies endpoint only carries labels, so this authenticated
// endpoint serves the exact rows those writes reference.
import { newRequestId, rateLimited } from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import {
  denyByCredentials,
  requireAuthenticated,
} from "../../lib/server/auth.ts";

import { listAuthors } from "../../lib/server/sql/authors.ts";

import { internal } from "../../lib/server/errors.ts";

import { queryRows } from "../../lib/server/db.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET - returns availabilities, categories, and authors with ids.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAuthenticated(ctx.req);
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    try {
      const [availabilities, categories, authors] = await Promise.all([
        queryRows<{ id: number; label: string }>(
          `select id, label from availability_statuses order by id`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from categories order by label`,
        ),
        listAuthors(),
      ]);
      return Response.json({ availabilities, categories, authors });
    } catch (err) {
      return internal(
        "GET /api/lookups",
        err,
        requestId,
        "Failed to fetch lookups",
      );
    }
  },
});
