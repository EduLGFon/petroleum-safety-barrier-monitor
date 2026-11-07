// API: /api/users/batch - admin bulk user actions.
// This is why it exists: bulk activate/deactivate/promote/demote/revoke needs
// one transactional request instead of N single-row PATCHes, while keeping the
// last-active-admin and last-active-local-admin guards intact.
import {
  badRequest,
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../lib/server/auth.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { readJsonBody } from "../../../lib/server/validation.ts";

import {
  batchUsers,
  normalizeUserBatchAction,
  normalizeUserBatchIds,
} from "../../../lib/server/sql/users.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { denyIfCrossSite } from "../../../lib/server/csrf.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "POST /api/users/batch",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("POST /api/users/batch", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as { action?: unknown; ids?: unknown };
    try {
      const ids = normalizeUserBatchIds(body.ids);
      const action = normalizeUserBatchAction(body.action);
      const result = await batchUsers(ids, action);
      return ok(result, requestId, {
        headers: { "cache-control": "no-store" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("ids") || message.includes("action") ||
        message.includes("last active") || message.includes("unique")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "POST /api/users/batch",
        err,
        requestId,
        "Failed to run user batch",
      );
    }
  },
});
