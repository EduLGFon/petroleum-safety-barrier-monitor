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
  hashPassword,
  validateNewPassword,
} from "../../lib/server/auth/password.ts";

import {
  createUser,
  listUsers,
  normalizeRole,
} from "../../lib/server/sql/users.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { readJsonBody } from "../../lib/server/validation.ts";

import { define } from "../../utils.ts";

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
      password?: unknown;
      role?: unknown;
    };
    try {
      const password = validateNewPassword(body.password);
      const role = normalizeRole(body.role ?? "user");
      const user = await createUser({
        email: body.email as string,
        name: (body.name as string | undefined) ?? "",
        passwordHash: await hashPassword(password),
        role,
      });
      return created(user, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("email") || message.includes("name") ||
        message.includes("password") || message.includes("role") ||
        message.includes("duplicate") || message.includes("unique")
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
