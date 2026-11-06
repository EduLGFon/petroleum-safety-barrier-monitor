// Route: GET /auth/entra/callback - completes an Entra OIDC flow.
// This is why it exists: the authorization code is exchanged server-side,
// the ID token is validated, and an opaque local session is created.
import {
  buildSessionCookie,
  createSessionToken,
  getSessionTokenFromRequest,
  hashSessionToken,
  isSecureRequest,
  sessionExpiry,
} from "../../../lib/server/auth/session.ts";

import {
  clearBindingCookie,
  consumeFlow,
  isSecureForConfig,
} from "../../../lib/server/auth/entra/flows.ts";

import {
  exchangeAuthorizationCode,
  getOidcConfiguration,
} from "../../../lib/server/auth/entra/client.ts";

import {
  internal,
  newRequestId,
  rateLimited,
  unavailable,
} from "../../../lib/server/errors.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { validateEntraClaims } from "../../../lib/server/auth/entra/claims.ts";

import { deleteExpiredSessions } from "../../../lib/server/sql/sessions.ts";

import {
  bindEntraIdentity,
  getPendingEntraUserByEmail,
  getUserByEntraIdentity,
} from "../../../lib/server/sql/users.ts";

import {
  createSession,
  deleteSession,
} from "../../../lib/server/sql/sessions.ts";

import { loadAuthConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

function redirect(location: string, headers?: Headers): Response {
  // Callers pass a Headers instance, never a plain object: spreading a
  // Headers into `{ location, ...headers }` yields no entries and would drop
  // Set-Cookie entirely. Copying via `new Headers(headers)` preserves every
  // entry, including repeated Set-Cookie values.
  const out = new Headers(headers);
  out.set("location", location);
  return new Response(null, { status: 303, headers: out });
}

function loginError(code: string, next?: string): string {
  const url = new URL("/login", "http://localhost");
  url.searchParams.set("sso", code);
  if (next) url.searchParams.set("next", next);
  return `${url.pathname}${url.search}`;
}

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(
      `GET /auth/entra/callback:${routeClientKey(ctx)}`,
    );
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    let authConfig;
    try {
      authConfig = loadAuthConfig();
    } catch (err) {
      return internal(
        "GET /auth/entra/callback",
        err,
        requestId,
        "Login failed",
      );
    }
    if (!authConfig.ssoEnabled || !authConfig.entra) {
      return new Response("Not Found", { status: 404 });
    }
    const entra = authConfig.entra;
    const secure = isSecureForConfig(authConfig, ctx.req);
    const cookieHeaders = new Headers();
    cookieHeaders.set("cache-control", "no-store");
    cookieHeaders.set("pragma", "no-cache");
    cookieHeaders.set("referrer-policy", "no-referrer");
    cookieHeaders.set("x-content-type-options", "nosniff");

    const errorCode = ctx.url.searchParams.get("error");
    const state = ctx.url.searchParams.get("state");
    if (errorCode) {
      if (state) await consumeFlow(state, null).catch(() => undefined);
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      const code = errorCode === "access_denied" ? "denied" : "failed";
      return redirect(loginError(code), cookieHeaders);
    }

    const code = ctx.url.searchParams.get("code");
    if (typeof code !== "string" || code === "" || code.length > 4096) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("expired"), cookieHeaders);
    }
    if (typeof state !== "string" || state === "" || state.length > 256) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("expired"), cookieHeaders);
    }

    const bindingToken = getCookie(ctx.req, "barrier_sso");
    const flow = await consumeFlow(state, bindingToken).catch(() => null);
    if (!flow) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("expired"), cookieHeaders);
    }

    const iss = ctx.url.searchParams.get("iss");
    if (
      iss !== null &&
      iss !== `https://login.microsoftonline.com/${entra.tenantId}/v2.0`
    ) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("failed"), cookieHeaders);
    }

    const syntheticUrl = new URL(entra.redirectUri);
    syntheticUrl.searchParams.set("code", code);
    syntheticUrl.searchParams.set("state", state);

    let oidc;
    try {
      oidc = await getOidcConfiguration(authConfig);
    } catch {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("unavailable"), cookieHeaders);
    }

    let claims;
    try {
      claims = await exchangeAuthorizationCode(authConfig, oidc, syntheticUrl, {
        expectedState: state,
        expectedNonce: flow.nonce,
        pkceCodeVerifier: flow.codeVerifier,
      });
    } catch {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("failed"), cookieHeaders);
    }

    let identity;
    try {
      identity = await validateEntraClaims(claims, entra, flow.nonce);
    } catch {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("failed"), cookieHeaders);
    }

    // Identity resolution runs the same ladder the suite's hub uses, minus
    // its last rung. First the bound object id, which is what every sign-in
    // after the first one matches on. Then, only for accounts an admin has
    // already enabled for SSO and that carry no object id yet, the address
    // this validated token vouches for - and that match binds the object id
    // for good, so the e-mail path never runs twice for the same account.
    //
    // The rung that is deliberately missing is just-in-time creation: an
    // address nobody enabled in this app does not get in, however valid its
    // token. Enabling access stays an explicit act inside the monitor.
    let user = await getUserByEntraIdentity(
      identity.tenantId,
      identity.objectId,
    ).catch(() => null);
    if (!user) {
      for (const email of identity.emails) {
        const pending = await getPendingEntraUserByEmail(email)
          .catch(() => null);
        if (!pending) continue;
        // A null here means the row stopped being bindable between the read
        // and the write - another callback won the race, or an admin changed
        // the account. Deny instead of falling through to the next address:
        // the account was found, and a second address must not re-decide it.
        user = await bindEntraIdentity(
          pending.id,
          identity.tenantId,
          identity.objectId,
        ).catch(() => null);
        break;
      }
    }
    if (!user || !user.active) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("no_access", flow.returnTo), cookieHeaders);
    }

    const token = createSessionToken();
    const expires = sessionExpiry();
    // Session fixation: revoke the presented session (if any) before minting
    // a new one, so a planted anonymous token cannot survive the login.
    const presented = getSessionTokenFromRequest(ctx.req);
    if (presented) {
      try {
        await deleteSession(await hashSessionToken(presented));
      } catch {
        // Best effort: revocation failure must not block the login.
      }
    }
    try {
      await createSession(user.id, await hashSessionToken(token), expires, {
        authMethod: "entra",
        idpSidHash: identity.sidHash,
      });
      await deleteExpiredSessions().catch(() => undefined);
    } catch {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return unavailable("Auth store unreachable", requestId);
    }

    // Success: set the session cookie and clear the one-time binding cookie
    // in the same 303. A headers array keeps the two Set-Cookie values as
    // separate header lines; Headers.set would overwrite the first, and
    // merging into a plain object would combine or drop them.
    const headers: [string, string][] = [
      ["cache-control", "no-store"],
      ["pragma", "no-cache"],
      ["referrer-policy", "no-referrer"],
      ["x-content-type-options", "nosniff"],
      [
        "set-cookie",
        buildSessionCookie(
          token,
          expires,
          isSecureRequest(ctx.req, authConfig.entra.appBaseUrl),
        ),
      ],
      ["set-cookie", clearBindingCookie(secure)],
      ["location", flow.returnTo],
    ];
    return new Response(null, { status: 303, headers });
  },
});

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const value = part.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      // Malformed percent-encoding parses as "no binding token".
      return null;
    }
  }
  return null;
}
