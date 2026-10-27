// API: GET raw Fracttal fields for one selected barrier, for DEV inspection.
// This is why it exists: developers can compare the live source with the
// mapped modal data without persisting or logging upstream response bodies.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../../lib/server/errors.ts";

import {
  isDevFracttalRawEnabled,
  loadServerConfig,
  loadSyncConfig,
} from "../../../../lib/server/config.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../../lib/server/auth.ts";

import {
  fracttalRawThrottle,
  routeClientKey,
} from "../../../../lib/server/throttle.ts";

import { fetchRawBarrierDetail } from "../../../../lib/server/fracttal/raw-detail.ts";

import { rateConfigFromEnv } from "../../../../lib/server/fracttal/adaptive-rate.ts";

import { createFracttalClient } from "../../../../lib/server/fracttal/client.ts";

import type { FracttalClient } from "../../../../lib/server/fracttal/client.ts";

import { getBarrierById } from "../../../../lib/server/sql/barriers.ts";

import { parseIdParam } from "../../../../lib/server/validation.ts";

import { define } from "../../../../utils.ts";

let client: FracttalClient | null = null;

function getFracttalClient(): FracttalClient {
  if (client) return client;
  const config = loadSyncConfig();
  const rate = rateConfigFromEnv();
  client = createFracttalClient({
    baseUrl: config.baseUrl,
    credentials: { key: config.key, secret: config.secret },
    ratePerMin: rate.initial,
    maxRatePerMin: rate.max,
    minRatePerMin: rate.min,
    rateBurst: rate.burst,
  });
  return client;
}

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
    const where = "GET /api/barriers/:id/fracttal-raw";
    try {
      loadServerConfig();
    } catch (err) {
      return internal(where, err, requestId, "Server misconfigured");
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(where, err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    if (!isDevFracttalRawEnabled()) return notFound("not found", requestId);
    const limit = fracttalRawThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited(
        "raw Fracttal request limit exceeded",
        requestId,
        limit.retryAfterMs,
      );
    }

    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    try {
      const barrier = await getBarrierById(barrierId, {
        includeDeleted: true,
      });
      if (!barrier?.externalCode) {
        return notFound("Barrier not found", requestId);
      }
      const detail = await fetchRawBarrierDetail(
        getFracttalClient(),
        barrier.externalCode,
      );
      if (detail.asset === null) {
        return notFound("Fracttal asset not found", requestId);
      }
      return ok(detail, requestId, {
        headers: { "cache-control": "private, no-store" },
      });
    } catch (err) {
      return internal(where, err, requestId, "Failed to fetch Fracttal data");
    }
  },
});
