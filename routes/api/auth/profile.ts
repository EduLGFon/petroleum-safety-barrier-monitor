// API: PATCH /api/auth/profile - self-service profile update.
// This is why it exists: every authenticated user needs to edit their own
// name, email, phone and password without admin privileges. Identity comes
// from the session cookie alone; token auth is rejected.
import {
  badRequest,
  internal,
  newRequestId,
  ok,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAuthenticated,
} from "../../../lib/server/auth.ts";

import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../../../lib/server/auth/password.ts";

import {
  passwordThrottle,
  routeClientKey,
} from "../../../lib/server/throttle.ts";

import { getUserById, updateUser } from "../../../lib/server/sql/users.ts";

import { buildExpiredCookie } from "../../../lib/server/auth/session.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { readJsonBody } from "../../../lib/server/validation.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = passwordThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "PATCH /api/auth/profile",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAuthenticated(ctx.req);
    } catch (err) {
      return authStoreUnavailable("PATCH /api/auth/profile", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    if (auth.via !== "session" || !auth.user) {
      return unauthorized("session required", requestId);
    }
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    try {
      const row = await getUserById(auth.user.id);
      if (!row || !row.active) {
        return unauthorized("not authenticated", requestId);
      }
      const currentPasswordHash = row.password_hash;
      let passwordHash: string | undefined;
      if (body.newPassword !== undefined && body.newPassword !== "") {
        if (row.auth_source !== "local" || currentPasswordHash === null) {
          return badRequest(
            "password login is not enabled for this account",
            requestId,
          );
        }
        if (
          typeof body.currentPassword !== "string" ||
          body.currentPassword === ""
        ) {
          return badRequest(
            "current and new passwords are required",
            requestId,
          );
        }
        const matches = await verifyPassword(
          body.currentPassword,
          currentPasswordHash,
        );
        if (!matches) {
          return unauthorized("current password is incorrect", requestId);
        }
        const next = validateNewPassword(body.newPassword);
        if (await verifyPassword(next, currentPasswordHash)) {
          return badRequest("new password must differ", requestId);
        }
        passwordHash = await hashPassword(next);
      }
      const updated = await updateUser(
        row.id,
        {
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash,
        },
        passwordHash
          ? {
            expectedPasswordHash: currentPasswordHash as string,
            requireActive: true,
          }
          : {},
      );
      if (!updated) return unauthorized("not authenticated", requestId);
      if (passwordHash) {
        return ok({ ok: true }, requestId, {
          headers: { "set-cookie": buildExpiredCookie() },
        });
      }
      return ok(updated, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate") || message.includes("unique")) {
        return badRequest("email already exists", requestId);
      }
      if (
        message.includes("email") || message.includes("name") ||
        message.includes("phone") || message.includes("password") ||
        message.includes("nothing to update")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "PATCH /api/auth/profile",
        err,
        requestId,
        "Profile update failed",
      );
    }
  },
});
