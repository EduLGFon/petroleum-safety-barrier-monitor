// API: PATCH /api/auth/profile - self-service profile update.
// This is why it exists: every authenticated user needs to edit their own
// name, email, phone and password without admin privileges. Identity comes
// from the session cookie alone; token auth is rejected. An email change is
// an identity change: it requires the current password and revokes every
// session, so a stolen cookie cannot move the account to another address.
import { PostgresError } from "@db/postgres";

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

import {
  getUserById,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  updateUser,
} from "../../../lib/server/sql/users.ts";

import { deleteSessionsForUser } from "../../../lib/server/sql/sessions.ts";

import {
  buildExpiredCookie,
  isSecureRequest,
} from "../../../lib/server/auth/session.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import {
  readJsonBody,
  ValidationError,
} from "../../../lib/server/validation.ts";

import { define } from "../../../utils.ts";

import { denyIfCrossSite } from "../../../lib/server/csrf.ts";

// normalizeInput: the user store's email/name/phone normalizers throw plain
// Error. Lift them into the typed rejection used by the catch below so a
// validation failure maps to 400 without substring-matching its message.
function normalizeInput<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new ValidationError(
      err instanceof Error ? err.message : "invalid input",
    );
  }
}

// isUniqueViolation: Postgres 23505. The response stays generic so callers
// cannot use this endpoint to test whether an address belongs to an account.
function isUniqueViolation(err: unknown): boolean {
  return err instanceof PostgresError && err.fields?.code === "23505";
}

export const handler = define.handlers({
  async PATCH(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
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
      const email = body.email === undefined
        ? undefined
        : normalizeInput(() => normalizeEmail(body.email));
      const name = body.name === undefined
        ? undefined
        : normalizeInput(() => normalizeName(body.name));
      const phone = body.phone === undefined
        ? undefined
        : normalizeInput(() => normalizePhone(body.phone));
      const emailChanged = email !== undefined && email !== row.email;
      const passwordRequested = body.newPassword !== undefined &&
        body.newPassword !== "";
      const requiresCurrentPassword = emailChanged || passwordRequested;
      if (
        !requiresCurrentPassword && email === undefined && name === undefined &&
        phone === undefined
      ) {
        return badRequest("nothing to update", requestId);
      }

      const localPasswordHash = row.auth_source === "local"
        ? row.password_hash
        : null;
      let expectedPasswordHash: string | undefined;
      if (requiresCurrentPassword) {
        // Entra accounts have no local password, so neither an email change
        // nor a password change can prove ownership. Reject before touching
        // the row.
        if (localPasswordHash === null) {
          return badRequest(
            "password login is not enabled for this account",
            requestId,
          );
        }
        if (
          typeof body.currentPassword !== "string" ||
          body.currentPassword === ""
        ) {
          return badRequest("current password is required", requestId);
        }
        const matches = await verifyPassword(
          body.currentPassword,
          localPasswordHash,
        );
        if (!matches) {
          return unauthorized("current password is incorrect", requestId);
        }
        expectedPasswordHash = localPasswordHash;
      }

      let passwordHash: string | undefined;
      if (passwordRequested) {
        const next = validateNewPassword(body.newPassword);
        if (await verifyPassword(next, expectedPasswordHash!)) {
          return badRequest("new password must differ", requestId);
        }
        passwordHash = await hashPassword(next);
      }

      // The hash guard makes a concurrent admin reset/deactivation win instead
      // of being overwritten after this route verified the old password.
      const guard = expectedPasswordHash === undefined ? {} : {
        expectedPasswordHash,
        requireActive: true,
      };
      const updated = await updateUser(
        row.id,
        { name, email, phone, passwordHash },
        guard,
      );
      if (!updated) return unauthorized("not authenticated", requestId);

      // updateUser revokes sessions itself for a password change; an email
      // change is identity-only there, so revoke explicitly. The caller must
      // sign in again with the new address.
      if (emailChanged) await deleteSessionsForUser(row.id);

      if (passwordHash !== undefined || emailChanged) {
        return ok(
          passwordHash === undefined ? updated : { ok: true },
          requestId,
          {
            headers: {
              "set-cookie": buildExpiredCookie(isSecureRequest(ctx.req)),
            },
          },
        );
      }
      return ok(updated, requestId);
    } catch (err) {
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      if (isUniqueViolation(err)) {
        return badRequest("profile update failed", requestId);
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
