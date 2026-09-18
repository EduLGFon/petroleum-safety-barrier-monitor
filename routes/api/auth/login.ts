// API: POST /api/auth/login - email + password cookie login.
// This is why it exists: dashboard users authenticate with credentials,
// not the ops ADMIN_TOKEN. Returns the public user and sets an HttpOnly
// session cookie; failures use one generic message to avoid enumeration.
import {
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
} from "../../../lib/server/auth/session.ts";

import {
  badRequest,
  internal,
  newRequestId,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import {
  getUserByEmail,
  normalizeEmail,
  toPublicUser,
} from "../../../lib/server/sql/users.ts";

import {
  createSession,
  deleteExpiredSessions,
} from "../../../lib/server/sql/sessions.ts";

import {
  isSecureRequest,
  sessionExpiry,
} from "../../../lib/server/auth/session.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { verifyPassword } from "../../../lib/server/auth/password.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // POST { email, password } - validates credentials, creates a session.
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
        "POST /api/auth/login",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let body: { email?: unknown; password?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const email = normalizeEmail(body.email);
      if (typeof body.password !== "string" || body.password === "") {
        return badRequest("email and password are required", requestId);
      }
      const user = await getUserByEmail(email);
      const ok = user !== null && user.active &&
        await verifyPassword(body.password, user.password_hash);
      if (!ok || !user) {
        return unauthorized("invalid credentials", requestId);
      }
      const token = createSessionToken();
      const expires = sessionExpiry();
      await createSession(user.id, await hashSessionToken(token), expires);
      try {
        await deleteExpiredSessions();
      } catch {
        // Sweep is opportunistic; a failure must not block login.
      }
      return Response.json(toPublicUser(user), {
        headers: {
          "set-cookie": buildSessionCookie(
            token,
            expires,
            isSecureRequest(ctx.req),
          ),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("email")) return badRequest(message, requestId);
      return internal("POST /api/auth/login", err, requestId, "Login failed");
    }
  },
});
