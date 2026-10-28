// API: /api/users/:id - single-user admin writes.
// This is why it exists: promoting users to admin, deactivating leavers,
// and resetting passwords are the core of access management. The last
// active admin cannot be demoted, deactivated, or deleted.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../../../lib/server/auth/password.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../lib/server/auth.ts";

import {
  deleteUser,
  getUserById,
  updateUser,
} from "../../../lib/server/sql/users.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import {
  normalizeEntraObjectId,
  parseIdParam,
  readJsonBody,
} from "../../../lib/server/validation.ts";

import {
  loadAuthConfig,
  loadServerConfig,
} from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // PATCH { name?, role?, active?, password? } - partial update.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
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
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("PATCH /api/users/:id", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid user id", requestId);
    }
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
      role?: unknown;
      active?: unknown;
      password?: unknown;
      authSource?: unknown;
      entraObjectId?: unknown;
    };
    try {
      let passwordHash: string | undefined;
      let entraTid: string | null | undefined;
      let entraOid: string | null | undefined;
      if (body.password !== undefined) {
        const target = await getUserById(id);
        if (!target) return notFound("User not found", requestId);
        if (target.auth_source !== "local" || target.password_hash === null) {
          return badRequest(
            "password is not allowed for this account",
            requestId,
          );
        }
        const next = validateNewPassword(body.password);
        // Match the self-service route: a reset must actually change the
        // password, not re-hash the same one.
        const currentPasswordHash = target.password_hash as string;
        if (await verifyPassword(next, currentPasswordHash)) {
          return badRequest("new password must differ", requestId);
        }
        passwordHash = await hashPassword(next);
      }
      if (body.authSource !== undefined || body.entraObjectId !== undefined) {
        const target = await getUserById(id);
        if (!target) return notFound("User not found", requestId);
        if (body.authSource === "entra" || body.entraObjectId !== undefined) {
          let authConfig;
          try {
            authConfig = loadAuthConfig();
          } catch (err) {
            return internal(
              "PATCH /api/users/:id",
              err,
              requestId,
              "Failed to update user",
            );
          }
          if (!authConfig.ssoEnabled || !authConfig.entra) {
            return badRequest("SSO is not enabled", requestId);
          }
          if (body.authSource === "entra") {
            entraTid = authConfig.entra.tenantId;
          }
          if (body.entraObjectId !== undefined) {
            entraOid = normalizeEntraObjectId(body.entraObjectId);
          }
        }
      }
      // updateUser revokes sessions itself when the password or active state
      // changes, in one transaction with the row update.
      const updated = await updateUser(id, {
        email: body.email,
        name: body.name,
        phone: body.phone,
        role: body.role,
        active: body.active,
        passwordHash,
        authSource: body.authSource,
        entraTid,
        entraOid,
      });
      if (!updated) return notFound("User not found", requestId);
      return ok(updated, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A self-demotion/deactivation is still the last-admin guard, but the
      // caller can act on a clearer "your own account" explanation. The wire
      // message stays English; the UI localizes it.
      if (message.includes("duplicate") || message.includes("unique")) {
        return badRequest(
          message.includes("email") || message.includes("users_email")
            ? "email already exists"
            : "duplicate value",
          requestId,
        );
      }
      const publicMessage = auth.user?.id === id &&
          message.includes("last active admin")
        ? message.replace(
          "the last active admin",
          "your own account while you are the last active admin",
        )
        : message;
      if (
        message.includes("email") || message.includes("name") ||
        message.includes("phone") || message.includes("role") ||
        message.includes("active") || message.includes("password") ||
        message.includes("nothing to update") ||
        message.includes("last active") ||
        message.includes("authSource") || message.includes("entra") ||
        message.includes("SSO")
      ) {
        return badRequest(publicMessage, requestId);
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
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("DELETE /api/users/:id", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid user id", requestId);
    }
    try {
      const removed = await deleteUser(id);
      if (!removed) return notFound("User not found", requestId);
      return ok({ ok: true }, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("last active admin")) {
        const publicMessage = auth.user?.id === id
          ? message.replace(
            "the last active admin",
            "your own account while you are the last active admin",
          )
          : message;
        return badRequest(publicMessage, requestId);
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
