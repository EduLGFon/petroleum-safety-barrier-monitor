// API: POST /api/auth/password - self-service password change.
// This is why it exists: non-admin users had no way to change their own
// password (only admins could set passwords via /api/users/:id). Identity
// comes from the session cookie alone - the body carries no id or email, so
// no user can address another user's password by construction. Token auth is
// rejected: ADMIN_TOKEN carries no user identity.
import {
  badRequest,
  internal,
  newRequestId,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../../../lib/server/auth/password.ts";

import {
  denyByCredentials,
  requireAuthenticated,
} from "../../../lib/server/auth.ts";

import {
  passwordThrottle,
  routeClientKey,
} from "../../../lib/server/throttle.ts";

import { deleteSessionsForUser } from "../../../lib/server/sql/sessions.ts";

import { getUserById, updateUser } from "../../../lib/server/sql/users.ts";

import { buildExpiredCookie } from "../../../lib/server/auth/session.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // POST { currentPassword, newPassword } - verifies the current password,
  // sets the new one, revokes every session (re-login required everywhere).
  async POST(ctx) {
    const requestId = newRequestId();
    const limit = passwordThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAuthenticated(ctx.req);
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    if (auth.via !== "session" || !auth.user) {
      return unauthorized("session required", requestId);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "POST /api/auth/password",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let body: { currentPassword?: unknown; newPassword?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    if (
      typeof body.currentPassword !== "string" || body.currentPassword === ""
    ) {
      return badRequest("current and new passwords are required", requestId);
    }
    try {
      const row = await getUserById(auth.user.id);
      if (!row || !row.active) {
        return unauthorized("not authenticated", requestId);
      }
      const matches = await verifyPassword(
        body.currentPassword,
        row.password_hash,
      );
      if (!matches) {
        return unauthorized("current password is incorrect", requestId);
      }
      const next = validateNewPassword(body.newPassword);
      if (await verifyPassword(next, row.password_hash)) {
        return badRequest("new password must differ", requestId);
      }
      await updateUser(row.id, { passwordHash: await hashPassword(next) });
      // Every session dies, including this one: a hijacked cookie must not
      // survive the change. The expired cookie below clears the browser.
      await deleteSessionsForUser(row.id);
      return Response.json({ ok: true }, {
        headers: { "set-cookie": buildExpiredCookie() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("password") || message.includes("nothing")) {
        return badRequest(message, requestId);
      }
      return internal(
        "POST /api/auth/password",
        err,
        requestId,
        "Password change failed",
      );
    }
  },
});
