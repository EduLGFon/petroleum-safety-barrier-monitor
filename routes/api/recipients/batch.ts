// API: /api/recipients/batch - admin-only bulk recipient actions.
// This is why it exists: the recipients manager performs bulk activate,
// deactivate, delete, and add-users through one atomic request per action.
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

import { batchRecipients } from "../../../lib/server/sql/recipients.ts";

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
        "POST /api/recipients/batch",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("POST /api/recipients/batch", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);

    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      action?: unknown;
      ids?: unknown;
      userIds?: unknown;
    };
    try {
      const affected = await batchRecipients(
        body.action,
        body.ids,
        body.userIds,
      );
      return ok({ affected }, requestId);
    } catch (err) {
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      return internal(
        "POST /api/recipients/batch",
        err,
        requestId,
        "Failed to run recipient batch",
      );
    }
  },
});
