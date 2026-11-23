// Route: GET /auth/entra/logged-out - registered post-logout landing.
// This is why it exists: Entra redirects here after logout; the route clears
// the local cookie (and, for a same-origin navigation, revokes the session
// row) and sends the browser back to login.
import {
  buildExpiredCookie,
  getSessionTokenFromRequest,
  isSecureRequest,
} from "../../../lib/server/auth/session.ts";

import { isCrossSiteRequest } from "../../../lib/server/csrf.ts";

import { hashSessionToken } from "../../../lib/server/auth/session.ts";

import { deleteSession } from "../../../lib/server/sql/sessions.ts";

import { loadAuthConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    let ssoEnabled = false;
    try {
      ssoEnabled = loadAuthConfig().ssoEnabled;
    } catch {
      // A broken SSO config must not expose the route either.
    }
    if (!ssoEnabled) return new Response("Not Found", { status: 404 });

    // SECURITY: a cross-site GET can be planted by any page (image, link) and
    // must not revoke the victim's server-side session. The provider redirect
    // is cross-site too, so this branch is the normal path: clear the cookie
    // and let the redirect continue instead of deleting the row.
    if (!isCrossSiteRequest(ctx.req)) {
      const raw = getSessionTokenFromRequest(ctx.req);
      if (raw) {
        try {
          await deleteSession(await hashSessionToken(raw));
        } catch {
          // Best effort: logout must not fail because of a DB blip.
        }
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
