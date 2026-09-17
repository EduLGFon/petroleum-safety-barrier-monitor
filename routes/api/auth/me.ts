// API: GET /api/auth/me - current session user.
// This is why it exists: islands cannot read the session cookie directly,
// so the client fetches this endpoint to learn its role and gate admin UI.
import {
  getSessionTokenFromRequest,
  hashSessionToken,
} from "../../../lib/server/auth/session.ts";

import {
  newRequestId,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import { readThrottle, routeClientKey } from "../../../lib/server/throttle.ts";

import { getSessionUser } from "../../../lib/server/sql/sessions.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // GET - returns { id, email, name, role } or 401 without a session.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const raw = getSessionTokenFromRequest(ctx.req);
    if (!raw) return unauthorized("not authenticated", requestId);
    try {
      const user = await getSessionUser(await hashSessionToken(raw));
      if (!user) return unauthorized("not authenticated", requestId);
      return Response.json(user);
    } catch {
      return unauthorized("not authenticated", requestId);
    }
  },
});
