// API: /api/users/:id - single-user admin writes.
// This is why it exists: promoting users to admin, deactivating leavers,
// and resetting passwords are the core of access management. The last
// active admin cannot be demoted, deactivated, or deleted.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
} from "../../../lib/server/errors.ts";

import {
  hashPassword,
  validateNewPassword,
} from "../../../lib/server/auth/password.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { deleteSessionsForUser } from "../../../lib/server/sql/sessions.ts";

import { deleteUser, updateUser } from "../../../lib/server/sql/users.ts";

import { rateLimited, unauthorized } from "../../../lib/server/errors.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { requireAdminAuth } from "../../../lib/server/auth.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // PATCH { name?, role?, active?, password? } - partial update.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "PATCH /api/users/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid user id", requestId);
    }
    let body: {
      name?: unknown;
      role?: unknown;
      active?: unknown;
      password?: unknown;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      let passwordHash: string | undefined;
      if (body.password !== undefined) {
        passwordHash = await hashPassword(validateNewPassword(body.password));
      }
      const updated = await updateUser(id, {
        name: body.name,
        role: body.role,
        active: body.active,
        passwordHash,
      });
      if (!updated) return notFound("User not found", requestId);
      if (passwordHash !== undefined) {
        await deleteSessionsForUser(id);
      }
      return Response.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("name") || message.includes("role") ||
        message.includes("active") || message.includes("password") ||
        message.includes("nothing to update") ||
        message.includes("last active admin")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "PATCH /api/users/:id",
        err,
        requestId,
        "Failed to update user",
      );
    }
  },

  // DELETE - removes the user; 400 when it is the last active admin.
  async DELETE(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "DELETE /api/users/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid user id", requestId);
    }
    try {
      const removed = await deleteUser(id);
      if (!removed) return notFound("User not found", requestId);
      return Response.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("last active admin")) {
        return badRequest(message, requestId);
      }
      return internal(
        "DELETE /api/users/:id",
        err,
        requestId,
        "Failed to delete user",
      );
    }
  },
});
