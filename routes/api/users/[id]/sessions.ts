// API: DELETE /api/users/:id/sessions - revoke all sessions for a user.
// This is why it exists: Entra users have no local password reset that would
// otherwise force revocation, so admins need an explicit revoke action.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../../lib/server/auth.ts";

import { getUserById } from "../../../../lib/server/sql/users.ts";

import { deleteSessionsForUser } from "../../../../lib/server/sql/sessions.ts";

import {
  routeClientKey,
  writeThrottle,
} from "../../../../lib/server/throttle.ts";

import { parseIdParam } from "../../../../lib/server/validation.ts";

import { loadServerConfig } from "../../../../lib/server/config.ts";

import { define } from "../../../../utils.ts";

export const handler = define.handlers({
  async DELETE(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "DELETE /api/users/:id/sessions",
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
        "DELETE /api/users/:id/sessions",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid user id", requestId);
    }
    try {
      const target = await getUserById(id);
      if (!target) return notFound("User not found", requestId);
      const revoked = await deleteSessionsForUser(id);
      return ok({ revoked }, requestId);
    } catch (err) {
      return internal(
        "DELETE /api/users/:id/sessions",
        err,
        requestId,
        "Failed to revoke sessions",
      );
    }
  },
});
