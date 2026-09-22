// API: /api/users - user management, admin only.
// This is why it exists: admins manage access and promote others to admin.
// The first account is provisioned via CLI (scripts/create-admin.ts); this
// route never self-registers, even on an empty table.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
} from "../../lib/server/errors.ts";

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

import { hasCredentials, requireAdminAuth } from "../../lib/server/auth.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { unauthorized } from "../../lib/server/errors.ts";

import { define } from "../../utils.ts";

async function guardAdmin(
  ctx: unknown,
  req: Request,
): Promise<Response | null> {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    // Anonymous callers cannot probe user management.
    if (!hasCredentials(req)) return notFound("not found", newRequestId());
    return unauthorized(auth.message, newRequestId());
  }
  void ctx;
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
    const denied = await guardAdmin(ctx, ctx.req);
    if (denied) return denied;
    try {
      loadServerConfig();
    } catch (err) {
      return internal("GET /api/users", err, requestId, "Server misconfigured");
    }
    try {
      return Response.json(await listUsers());
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
    const denied = await guardAdmin(ctx, ctx.req);
    if (denied) return denied;
    let body: {
      email?: unknown;
      name?: unknown;
      password?: unknown;
      role?: unknown;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const password = validateNewPassword(body.password);
      const role = normalizeRole(body.role ?? "user");
      const created = await createUser({
        email: body.email as string,
        name: (body.name as string | undefined) ?? "",
        passwordHash: await hashPassword(password),
        role,
      });
      return Response.json(created, { status: 201 });
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
