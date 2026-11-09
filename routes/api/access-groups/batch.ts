// API: /api/access-groups/batch - admin bulk operations on access groups.
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
  readJsonBodyCapped,
  ValidationError,
} from "../../../lib/server/validation.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { batchAccessGroups } from "../../../lib/server/sql/access-groups.ts";

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
        "POST /api/access-groups/batch",
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
        "POST /api/access-groups/batch",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const parsed = await readJsonBodyCapped(ctx.req, 256 * 1024);
    if (!parsed.ok) {
      return badRequest(
        parsed.reason === "too-large"
          ? "Request body is too large"
          : "Invalid JSON body",
        requestId,
      );
    }
    try {
      const result = await batchAccessGroups(parsed.body as never);
      return ok(result, requestId);
    } catch (err) {
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      return internal(
        "POST /api/access-groups/batch",
        err,
        requestId,
        "Failed to run batch",
      );
    }
  },
});
