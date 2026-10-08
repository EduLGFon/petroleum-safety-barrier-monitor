// API: GET /api/sync-changes - paged per-barrier sync change list.
// This is why it exists: the details modal needs analyzable scopes
// (last run vs rolling 24h) with paged light rows, plus per-barrier detail
// loaded on demand. Authenticated GET, read-only like /api/sync-status.
import {
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { listSyncChanges } from "../../lib/server/sql/sync.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import {
  authStoreUnavailable,
  denyDataAuth,
  requireDataAuth,
} from "../../lib/server/auth.ts";

import { define } from "../../utils.ts";

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export const handler = define.handlers({
  // GET paged changes. Params:
  //   scope=last-run|last-day (default last-run)
  //   runId=<id> (pins a specific run, overrides scope)
  //   kind=new|updated|removed|restored|all (default all)
  //   query=<tag substring> (default "")
  //   page, pageSize (default 1, 25; pageSize max 100)
  // Legacy ?limit= is honored as pageSize for the old hover card.
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
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/sync-changes", err, requestId);
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);

    const url = new URL(ctx.req.url);
    const params = url.searchParams;
    const scope = params.get("scope");
    const runRaw = params.get("runId");
    const runId = runRaw !== null ? Number.parseInt(runRaw, 10) : null;
    const kind = params.get("kind") ?? "all";
    const query = params.get("query") ?? params.get("q") ?? "";
    const legacyLimit = params.get("limit");
    const page = clampInt(params.get("page"), 1, 1, 100000);
    const pageSize = legacyLimit !== null && params.get("pageSize") === null
      ? clampInt(legacyLimit, 8, 1, 100)
      : clampInt(params.get("pageSize"), 25, 1, 100);

    try {
      // Legacy hover-card shape: ?limit= without paging params returns
      // { changes } so the old card keeps working during rollout.
      const legacy = legacyLimit !== null && params.get("page") === null &&
        scope === null && runRaw === null && params.get("kind") === null &&
        (params.get("query") === null && params.get("q") === null);
      if (legacy) {
        const result = await listSyncChanges({ page: 1, pageSize });
        const changes = result.items.map((c) => ({
          barrierId: c.barrierId,
          tag: c.tag,
          location: c.location,
          kind: c.kind,
          status: c.status,
          changedAt: c.changedAt,
        }));
        return okWithEtag(ctx.req, { changes }, requestId);
      }
      const result = await listSyncChanges({
        runId: Number.isInteger(runId) && (runId as number) > 0 ? runId : null,
        sinceHours: runRaw !== null
          ? null
          : scope === "last-day"
          ? 24
          : scope === "last-run" || scope === null
          ? null
          : 24,
        kind,
        query,
        page,
        pageSize,
      });
      // When runId is absent and scope is last-run, listSyncChanges resolves
      // the latest finished run internally.
      return okWithEtag(ctx.req, result, requestId);
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
