// Route: GET /auth/entra/logged-out - registered post-logout landing.
// This is why it exists: Entra redirects here after logout; the route clears
// any local session and sends the browser back to login.
import {
  buildExpiredCookie,
  getSessionTokenFromRequest,
  isSecureRequest,
} from "../../../lib/server/auth/session.ts";

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
    // Mirror Secure on the clear so it revokes the Secure session cookie set
    // at login; isSecureRequest falls back to APP_BASE_URL for proxies.
    headers.set("set-cookie", buildExpiredCookie(isSecureRequest(ctx.req)));
    headers.set("cache-control", "no-store");
    headers.set("pragma", "no-cache");
    headers.set("referrer-policy", "no-referrer");
    headers.set("location", "/login?sso=logout");
    return new Response(null, { status: 303, headers });
  },
});
