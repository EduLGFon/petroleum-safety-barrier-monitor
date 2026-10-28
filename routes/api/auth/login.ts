// API: POST /api/auth/login - email + password cookie login.
// This is why it exists: dashboard users authenticate with credentials,
// not the ops ADMIN_TOKEN. Returns the public user and sets an HttpOnly
// session cookie; failures use one generic message to avoid enumeration.
import {
  badRequest,
  internal,
  newRequestId,
  ok,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import {
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
} from "../../../lib/server/auth/session.ts";

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

import { readJsonBody } from "../../../lib/server/validation.ts";

import { define } from "../../../utils.ts";

// DUMMY_PASSWORD_HASH: valid 210k-iteration digest verified when the e-mail
// is unknown or the account is inactive. Always paying the PBKDF2 cost keeps
// response timing from revealing which emails exist; the generic 401 already
// hides the message side of enumeration. Regenerate it if the PBKDF2 iteration
// count changes in lib/server/auth/password.ts.
const DUMMY_PASSWORD_HASH =
  "pbkdf2$210000$pdOZd6xzTouTgnvS/jpifg==$guuZhsKO5i+JQEEmO3SEgneUwf5XoaX5sWYhiPxe8nc=";

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
    const parsedLogin = await readJsonBody(ctx.req);
    if (!parsedLogin.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsedLogin.body as {
      email?: unknown;
      password?: unknown;
    };
    try {
      const email = normalizeEmail(body.email);
      if (typeof body.password !== "string" || body.password === "") {
        return badRequest("email and password are required", requestId);
      }
      const user = await getUserByEmail(email);
      // SSO users have no local password. Treat them like unknown accounts so
      // timing and enumeration behavior stay unchanged.
      const activeUser =
        user !== null && user.active && user.auth_source === "local" &&
          typeof user.password_hash === "string"
          ? user
          : null;
      // Unknown and inactive accounts verify against the dummy digest so the
      // KDF costs the same as a real wrong-password attempt.
      const credentialsOk = await verifyPassword(
        body.password,
        activeUser?.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!activeUser || !credentialsOk) {
        return unauthorized("invalid credentials", requestId);
      }
      const token = createSessionToken();
      const expires = sessionExpiry();
      await createSession(
        activeUser.id,
        await hashSessionToken(token),
        expires,
      );
      try {
        await deleteExpiredSessions();
      } catch {
        // Sweep is opportunistic; a failure must not block login.
      }
      return ok(toPublicUser(activeUser), requestId, {
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
