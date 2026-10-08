// API: POST /api/auth/logout - revokes the session cookie.
// This is why it exists: login creates an opaque server session, so logout
// must delete that row and clear the cookie; missing cookies still succeed.
import {
  buildExpiredCookie,
  getSessionTokenFromRequest,
} from "../../../lib/server/auth/session.ts";

import {
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { hashSessionToken } from "../../../lib/server/auth/session.ts";

import { deleteSession } from "../../../lib/server/sql/sessions.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // POST - revokes the current session and clears the cookie.
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
        "POST /api/auth/logout",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    try {
      const raw = getSessionTokenFromRequest(ctx.req);
      if (raw) await deleteSession(await hashSessionToken(raw));
      return ok({ ok: true }, requestId, {
        headers: { "set-cookie": buildExpiredCookie() },
      });
    } catch (err) {
      return internal("POST /api/auth/logout", err, requestId, "Logout failed");
    }
  },
});
