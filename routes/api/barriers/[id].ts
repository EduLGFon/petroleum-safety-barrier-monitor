// API: GET /api/barriers/:id - single wire barrier or 404.
// This is why it exists: Fresh port of the Next route with identical
// id validation. Open GET, throttled, envelope errors.
import { getBarrierById } from "../../../lib/server/sql/barriers.ts";
import { loadServerConfig } from "../../../lib/server/config.ts";
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
} from "../../../lib/server/errors.ts";
import { readThrottle, routeClientKey } from "../../../lib/server/throttle.ts";
import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // GET single barrier by numeric id; 400 invalid, 404 when missing.
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
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Server misconfigured",
      );
    }

    const barrierId = Number(ctx.params.id);

    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return badRequest("Invalid barrier id", requestId);
    }

    try {
      const barrier = await getBarrierById(barrierId);
      if (!barrier) {
        return notFound("Barrier not found", requestId);
      }
      return Response.json(barrier);
    } catch (err) {
      return internal(
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Failed to fetch barrier",
      );
    }
  },
});
