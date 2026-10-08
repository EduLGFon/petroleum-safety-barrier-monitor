// API: GET /api/auth/me - current session user.
// This is why it exists: islands cannot read the session cookie directly,
// so the client fetches this endpoint to learn its role and gate admin UI.
import {
  getSessionTokenFromRequest,
  hashSessionToken,
} from "../../../lib/server/auth/session.ts";

import {
  internal,
  newRequestId,
  ok,
  rateLimited,
  unauthorized,
  unavailable,
} from "../../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../../lib/server/throttle.ts";

import { getSessionUser } from "../../../lib/server/sql/sessions.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // GET - returns { id, email, name, role } or 401 without a session.
  // A throwing session store (DB blip) answers 503, never 401 - an infra
  // failure must not read as a dead credential that drops the user to login.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/auth/me",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const raw = getSessionTokenFromRequest(ctx.req);
    if (!raw) return unauthorized("not authenticated", requestId);
    try {
      const user = await getSessionUser(await hashSessionToken(raw));
      if (!user) return unauthorized("not authenticated", requestId);
      return ok(user, requestId);
    } catch (err) {
      console.error(`[GET /api/auth/me] requestId=${requestId}`, err);
      return unavailable("Auth store unreachable", requestId);
    }
  },
});
