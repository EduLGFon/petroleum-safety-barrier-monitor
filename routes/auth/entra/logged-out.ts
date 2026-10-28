// Route: GET /auth/entra/logged-out - registered post-logout landing.
// This is why it exists: Entra redirects here after logout; the route clears
// any local session and sends the browser back to login.
import { getSessionTokenFromRequest } from "../../../lib/server/auth/session.ts";

import { hashSessionToken } from "../../../lib/server/auth/session.ts";

import { deleteSession } from "../../../lib/server/sql/sessions.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const raw = getSessionTokenFromRequest(ctx.req);
    if (raw) {
      try {
        await deleteSession(await hashSessionToken(raw));
      } catch {
        // Best effort: logout must not fail because of a DB blip.
      }
    }
    const headers = new Headers();
    headers.set(
      "set-cookie",
      "barrier_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    headers.set("cache-control", "no-store");
    headers.set("pragma", "no-cache");
    headers.set("referrer-policy", "no-referrer");
    headers.set("location", "/login?sso=logout");
    return new Response(null, { status: 303, headers });
  },
});
