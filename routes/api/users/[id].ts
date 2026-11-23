// API: /api/users/:id - single-user admin writes.
// This is why it exists: promoting users to admin, deactivating leavers,
// and resetting passwords are the core of access management. The last
// active admin cannot be demoted, deactivated, or deleted.
import {
  normalizeEmail,
  normalizeEntraObjectId,
  normalizeName,
  normalizePhone,
  parseIdParam,
  POSTGRES_UNIQUE_VIOLATION,
  postgresErrorInfo,
  readJsonBody,
  ValidationError,
} from "../../../lib/server/validation.ts";

import {
  generateTemporaryPassword,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../../../lib/server/auth/password.ts";

import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

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

import {
  loadAuthConfig,
  loadServerConfig,
} from "../../../lib/server/config.ts";

import { sendAccountNotice } from "../../../lib/server/alerts/account-notice.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { denyIfCrossSite } from "../../../lib/server/csrf.ts";

import { define } from "../../../utils.ts";

interface UserPatchBody {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  role?: unknown;
  active?: unknown;
  password?: unknown;
  resetPassword?: unknown;
  authSource?: unknown;
  entraObjectId?: unknown;
}

// duplicateMessage: a unique violation reported by the driver, mapped to a
// controlled message. The SQLSTATE and the constraint name decide - never the
// error text, so driver wording can never leak into a response.
function duplicateMessage(err: unknown): string | undefined {
  const info = postgresErrorInfo(err);
  if (info.code !== POSTGRES_UNIQUE_VIOLATION) return undefined;
  return info.constraint === "users_email_key"
    ? "email already exists"
    : "duplicate value";
}

// validatedPassword: the password policy gate. The policy helper raises a
// plain Error, so the rejection is translated into the typed error the
// route maps to 400 - a short, long or non-string password is client input,
// never an internal failure. The wording is kept so the admin UI still
// localizes it.
function validatedPassword(raw: unknown): string {
  try {
    return validateNewPassword(raw);
  } catch (err) {
    throw new ValidationError(
      err instanceof Error ? err.message : "invalid password",
    );
  }
}

// validateUserPatch: typed checks on the request body before anything
// reaches the store. A rejection is a ValidationError, so the route maps it
// to 400 by type instead of by matching error text later.
function validateUserPatch(body: UserPatchBody): void {
  if (body.email !== undefined) normalizeEmail(body.email);
  if (body.name !== undefined) normalizeName(body.name);
  if (body.phone !== undefined) normalizePhone(body.phone);
  if (
    body.role !== undefined && body.role !== "admin" && body.role !== "user"
  ) {
    throw new ValidationError("role must be admin or user");
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw new ValidationError("active must be a boolean");
  }
  if (
    body.authSource !== undefined && body.authSource !== "local" &&
    body.authSource !== "entra"
  ) {
    throw new ValidationError("authSource must be local or entra");
  }
  if (
    body.entraObjectId !== undefined && body.entraObjectId !== null &&
    body.entraObjectId !== ""
  ) {
    normalizeEntraObjectId(body.entraObjectId);
  }
}

// hasUserUpdate: true when the request carries at least one field the store
// would write. An empty set is "nothing to update" - a client-input
// rejection, so it is raised here as a typed error.
function hasUserUpdate(body: UserPatchBody): boolean {
  if (body.email !== undefined || body.name !== undefined) return true;
  if (body.phone !== undefined || body.role !== undefined) return true;
  if (body.active !== undefined || body.authSource !== undefined) return true;
  if (body.password !== undefined || body.resetPassword === true) return true;
  const oid = body.entraObjectId;
  return oid !== undefined && oid !== null && oid !== "";
}

export const handler = define.handlers({
  // PATCH { name?, role?, active?, password? } - partial update.
  async PATCH(ctx) {
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
    const body = parsed.body as UserPatchBody;
    try {
      // Typed input validation first: a malformed body is rejected here,
      // before any query runs, and the catch below maps it to 400 by type.
      validateUserPatch(body);
      if (!hasUserUpdate(body)) {
        throw new ValidationError("nothing to update");
      }
      let passwordHash: string | undefined;
      // resetPassword: the admin asks the system to draw a new password
      // instead of inventing one. This is how an account that still carries
      // a shared or leaked password gets a private one, and it is the only
      // path that also notifies the person.
      let generatedPassword: string | null = null;
      let entraTid: string | null | undefined;
      let entraOid: string | null | undefined;
      if (body.resetPassword === true) {
        // One intent per call: a drawn password plus an explicit one, or a
        // password plus an auth-source switch, would produce a conflicting
        // SET in the same UPDATE. Reject before any write.
        if (
          body.password !== undefined || body.authSource !== undefined ||
          body.entraObjectId !== undefined
        ) {
          return badRequest(
            "resetPassword cannot be combined with password, authSource or entraObjectId",
            requestId,
          );
        }
        const target = await getUserById(id);
        if (!target) return notFound("User not found", requestId);
        if (target.auth_source !== "local") {
          return badRequest(
            "Microsoft accounts have no password to reset",
            requestId,
          );
        }
        generatedPassword = generateTemporaryPassword();
        passwordHash = await hashPassword(generatedPassword);
      }
      if (body.password !== undefined) {
        if (body.authSource !== undefined || body.entraObjectId !== undefined) {
          return badRequest(
            "password cannot be combined with authSource or entraObjectId",
            requestId,
          );
        }
        const target = await getUserById(id);
        if (!target) return notFound("User not found", requestId);
        if (target.auth_source !== "local" || target.password_hash === null) {
          return badRequest(
            "password is not allowed for this account",
            requestId,
          );
        }
        const next = validatedPassword(body.password);
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
        // Domain rejections the store would raise for an impossible identity
        // change, answered here so they stay typed 400s.
        if (body.authSource === "local" && target.auth_source === "entra") {
          return badRequest(
            "conversion back to local is not supported",
            requestId,
          );
        }
        const bindsObjectId = body.entraObjectId !== undefined &&
          body.entraObjectId !== null && body.entraObjectId !== "";
        if (
          bindsObjectId && target.auth_source !== "entra" &&
          body.authSource !== "entra"
        ) {
          return badRequest("entraObjectId requires an Entra user", requestId);
        }
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
          // Converting without an object id is the normal case: the admin
          // knows the address, not the GUID. The account becomes pending and
          // the first valid Entra sign-in for that address binds it. Tenant
          // and object id travel together so the pair is never half-filled -
          // a row with a tenant and no object id would read as "bound to a
          // tenant" while matching nothing.
          const hasObjectId = body.entraObjectId !== undefined &&
            body.entraObjectId !== null && body.entraObjectId !== "";
          if (hasObjectId) {
            entraOid = normalizeEntraObjectId(body.entraObjectId);
            entraTid = authConfig.entra.tenantId;
          } else if (body.authSource === "entra") {
            entraTid = null;
            entraOid = null;
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
        // A drawn password is temporary by definition: the person must
        // replace it on the next sign-in, same as a brand-new account.
        ...(generatedPassword !== null ? { mustChangePassword: true } : {}),
        authSource: body.authSource,
        entraTid,
        entraOid,
      });
      if (!updated) return notFound("User not found", requestId);
      if (generatedPassword === null) return ok(updated, requestId);
      // Same contract as creation: the password rides back once so the admin
      // can hand it over even if the message failed, and the outcome of the
      // notice is reported instead of assumed. Fail soft on any unexpected
      // notice error so a successful reset is not reported as a failure.
      let aviso: { sent: boolean; reason?: string } | null = null;
      try {
        aviso = await sendAccountNotice({
          accountId: updated.id,
          kind: "senha_reset",
          password: generatedPassword,
          name: updated.name || updated.email,
          login: updated.email,
          phone: updated.phone,
        });
      } catch {
        aviso = { sent: false, reason: "notice failed" };
      }
      return ok(
        { ...updated, temporaryPassword: generatedPassword, aviso },
        requestId,
        { headers: { "cache-control": "no-store" } },
      );
    } catch (err) {
      // Typed classification: a ValidationError is a client-input rejection
      // and keeps its 400, a unique violation is a duplicate row the caller
      // can fix, and the last-admin guard is a policy rejection with its own
      // wording. Everything else is internal - database text never reaches a
      // client, and no error is classified by matching words in a message.
      if (err instanceof ValidationError) {
        // A self-demotion/deactivation is still the last-admin guard, but the
        // caller can act on a clearer "your own account" explanation. The
        // wire message stays English; the UI localizes it.
        const publicMessage = auth.user?.id === id
          ? err.message.replace(
            "the last active admin",
            "your own account while you are the last active admin",
          )
          : err.message;
        return badRequest(publicMessage, requestId);
      }
      const duplicate = duplicateMessage(err);
      if (duplicate !== undefined) {
        return badRequest(duplicate, requestId);
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
      // A ValidationError (including the last-admin guards) is a
      // client-answerable rejection; every other failure stays internal so
      // database text never leaks.
      if (err instanceof ValidationError) {
        const publicMessage = auth.user?.id === id
          ? err.message.replace(
            "the last active admin",
            "your own account while you are the last active admin",
          )
          : err.message;
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
