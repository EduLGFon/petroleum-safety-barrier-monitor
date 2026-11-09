// API: /api/alert-rules/batch - admin bulk activate/deactivate/delete.
// This is why it exists: the rules page selects many rows and applies one
// action atomically instead of N single-row requests.
import {
  batchAlertRules,
  normalizeAlertRuleBatchAction,
  normalizeAlertRuleBatchIds,
} from "../../../lib/server/sql/alert_rules.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../lib/server/auth.ts";

import {
  badRequest,
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  readJsonBody,
  ValidationError,
} from "../../../lib/server/validation.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

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
        "POST /api/alert-rules/batch",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "POST /api/alert-rules/batch",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as Record<string, unknown>;
    try {
      const action = normalizeAlertRuleBatchAction(body.action);
      const ids = normalizeAlertRuleBatchIds(body.ids);
      const result = await batchAlertRules(action, ids);
      return ok(result, requestId);
    } catch (err) {
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      return internal(
        "POST /api/alert-rules/batch",
        err,
        requestId,
        "Failed to run alert rule batch",
      );
    }
  },
});
