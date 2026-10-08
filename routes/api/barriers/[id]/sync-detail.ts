// API: GET /api/barriers/:id/sync-detail - before/after diff for one barrier.
// This is why it exists: the change list stays light (no snapshots), and
// expanding a row loads exactly one barrier's diff. Authenticated GET.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  okWithEtag,
  rateLimited,
} from "../../../../lib/server/errors.ts";

import {
  readThrottle,
  routeClientKey,
} from "../../../../lib/server/throttle.ts";

import { getBarrierSyncDetail } from "../../../../lib/server/sql/sync.ts";

import { loadServerConfig } from "../../../../lib/server/config.ts";

import {
  authStoreUnavailable,
  denyDataAuth,
  requireDataAuth,
} from "../../../../lib/server/auth.ts";

import { parseIdParam } from "../../../../lib/server/validation.ts";

import { define } from "../../../../utils.ts";

export const handler = define.handlers({
  // GET one barrier's sync diff. ?runId=<id> pins a run, ?scope=last-day
  // uses the rolling 24h window; absent both uses the latest change.
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
        `GET /api/barriers/${ctx.params.id}/sync-detail`,
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        `GET /api/barriers/${ctx.params.id}/sync-detail`,
        err,
        requestId,
      );
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);
    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    const params = new URL(ctx.req.url).searchParams;
    const runRaw = params.get("runId");
    const runId = runRaw !== null ? Number.parseInt(runRaw, 10) : null;
    const scope = params.get("scope");
    try {
      const detail = await getBarrierSyncDetail(barrierId, {
        runId: Number.isInteger(runId) && (runId as number) > 0 ? runId : null,
        sinceHours: runRaw !== null ? null : scope === "last-day" ? 24 : null,
      });
      if (!detail) return notFound("No sync change found", requestId);
      return okWithEtag(ctx.req, { detail }, requestId);
    } catch (err) {
      return internal(
        `GET /api/barriers/${ctx.params.id}/sync-detail`,
        err,
        requestId,
        "Failed to fetch sync detail",
      );
    }
  },
});
