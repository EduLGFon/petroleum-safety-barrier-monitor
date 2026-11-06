// API: /api/users - user management, admin only.
// This is why it exists: admins manage access and promote others to admin.
// The first account is provisioned via CLI (scripts/create-admin.ts); this
// route never self-registers, even on an empty table.
import {
  badRequest,
  created,
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../lib/server/auth.ts";

import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../lib/server/throttle.ts";

import {
  generateTemporaryPassword,
  hashPassword,
  validateNewPassword,
} from "../../lib/server/auth/password.ts";

import {
  normalizeEntraObjectId,
  readJsonBody,
} from "../../lib/server/validation.ts";

import {
  createUser,
  listUsers,
  normalizeRole,
} from "../../lib/server/sql/users.ts";

import { replaceUserGroups } from "../../lib/server/sql/access-groups.ts";

import { loadAuthConfig, loadServerConfig } from "../../lib/server/config.ts";

import { sendAccountNotice } from "../../lib/server/alerts/account-notice.ts";

import { define } from "../../utils.ts";

import { denyIfCrossSite } from "../../lib/server/csrf.ts";

// guardAdmin: shared admin gate with the caller's requestId (never a fresh
// one, so denied responses correlate with the handler's log line). Returns
// null when authorized, otherwise the denial response.
async function guardAdmin(
  req: Request,
  requestId: string,
  logLabel: string,
): Promise<Response | null> {
  let auth;
  try {
    auth = await requireAdminAuth(req);
  } catch (err) {
    return authStoreUnavailable(logLabel, err, requestId);
  }
  if (!auth.ok) return denyByCredentials(req, auth.message, requestId);
  return null;
}

export const handler = define.handlers({
  // GET - lists users without password hashes.
  async GET(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal("GET /api/users", err, requestId, "Server misconfigured");
    }
    const denied = await guardAdmin(ctx.req, requestId, "GET /api/users");
    if (denied) return denied;
    try {
      return okWithEtag(ctx.req, await listUsers(), requestId);
    } catch (err) {
      return internal(
        "GET /api/users",
        err,
        requestId,
        "Failed to fetch users",
      );
    }
  },

  // POST { email, name?, password, role? } - creates a user, admin session
  // required. First accounts come from scripts/create-admin.ts, never here.
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
        "POST /api/users",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const denied = await guardAdmin(ctx.req, requestId, "POST /api/users");
    if (denied) return denied;
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
      password?: unknown;
      role?: unknown;
      authSource?: unknown;
      entraObjectId?: unknown;
      accessGroupIds?: unknown;
    };
    try {
      const role = normalizeRole(body.role ?? "user");
      const groupIds = body.accessGroupIds === undefined
        ? []
        : Array.isArray(body.accessGroupIds)
        ? body.accessGroupIds
        : (() => {
          throw new Error("accessGroupIds must be an array");
        })();
      for (const id of groupIds) {
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
          throw new Error("accessGroupIds must contain positive integers");
        }
      }
      const authSource = body.authSource === "entra" ? "entra" : "local";
      if (
        body.authSource !== undefined && body.authSource !== "local" &&
        body.authSource !== "entra"
      ) {
        throw new Error("authSource must be local or entra");
      }
      let user;
      let temporaryPassword: string | null = null;
      if (authSource === "entra") {
        const authConfig = loadAuthConfig();
        if (!authConfig.ssoEnabled || !authConfig.entra) {
          throw new Error("SSO is not enabled");
        }
        if (body.password !== undefined) {
          throw new Error("password is not allowed for Entra users");
        }
        // The object id is optional on purpose. Supplying it binds the
        // identity up front; omitting it leaves the account pending, and the
        // first valid Entra sign-in for this same address binds it. Asking an
        // admin to paste a GUID per person does not scale, and the address is
        // the thing they actually know.
        const entraOid = body.entraObjectId === undefined ||
            body.entraObjectId === null || body.entraObjectId === ""
          ? null
          : normalizeEntraObjectId(body.entraObjectId);
        user = await createUser({
          email: body.email as string,
          name: (body.name as string | undefined) ?? "",
          phone: body.phone,
          role,
          authSource: "entra",
          // Tenant travels with the object id: a pending account carries
          // neither, so the two columns are never half-filled.
          entraTid: entraOid === null ? null : authConfig.entra.tenantId,
          entraOid,
        });
      } else {
        // No password in the body means the admin is not inventing one: the
        // system draws a different password for this person and marks the
        // account, so the first sign-in has to replace it. An admin who does
        // send a password keeps the old behaviour and no mark.
        const informada = typeof body.password === "string" &&
          body.password !== "";
        const password = informada
          ? validateNewPassword(body.password)
          : generateTemporaryPassword();
        user = await createUser({
          email: body.email as string,
          name: (body.name as string | undefined) ?? "",
          phone: body.phone,
          passwordHash: await hashPassword(password),
          role,
          authSource: "local",
          mustChangePassword: !informada,
        });
        // Returned exactly once, in the creation response, and never stored
        // in clear anywhere. Until the MSGFLOW message exists this is the
        // only way the admin can hand the credential over.
        if (!informada) temporaryPassword = password;
      }
      // A non-admin with no group is intentionally zero-access (fail
      // closed). Persist the explicit memberships chosen at creation.
      if (user.role !== "admin" && groupIds.length > 0) {
        await replaceUserGroups(user.id, groupIds as number[]);
      }
      // The notice is best effort and comes AFTER the account exists. If
      // MSGFLOW is down the person is still created and the password is
      // still on the admin's screen - the path that never depends on
      // anything else. The outcome rides back so the screen can say whether
      // the message left, instead of letting the admin assume it did.
      let aviso: { sent: boolean; reason?: string } | null = null;
      if (temporaryPassword !== null) {
        aviso = await sendAccountNotice({
          accountId: user.id,
          kind: "senha_criada",
          password: temporaryPassword,
          name: user.name || user.email,
          login: user.email,
          phone: user.phone,
        });
      }
      return created(
        temporaryPassword === null
          ? user
          : { ...user, temporaryPassword, aviso },
        requestId,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("duplicate") || message.includes("unique")) {
        return badRequest(
          message.includes("email") || message.includes("users_email")
            ? "email already exists"
            : "duplicate value",
          requestId,
        );
      }
      if (
        message.includes("email") || message.includes("name") ||
        message.includes("password") || message.includes("role") ||
        message.includes("phone") || message.includes("invalid phone") ||
        message.includes("accessGroupIds")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "POST /api/users",
        err,
        requestId,
        "Failed to create user",
      );
    }
  },
});
