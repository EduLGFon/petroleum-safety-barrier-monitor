// Route: GET /auth/entra/callback - completes an Entra OIDC flow.
// This is why it exists: the authorization code is exchanged server-side,
// the ID token is validated, and an opaque local session is created.
import {
  buildSessionCookie,
  createSessionToken,
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

import { getUserByEntraIdentity } from "../../../lib/server/sql/users.ts";

import { createSession } from "../../../lib/server/sql/sessions.ts";

import { loadAuthConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

function redirect(location: string, headers?: HeadersInit): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
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
    const limit = writeThrottle.check(routeClientKey(ctx));
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

    const user = await getUserByEntraIdentity(
      identity.tenantId,
      identity.objectId,
    ).catch(() => null);
    if (!user || !user.active) {
      cookieHeaders.set("set-cookie", clearBindingCookie(secure));
      return redirect(loginError("no_access", flow.returnTo), cookieHeaders);
    }

    const token = createSessionToken();
    const expires = sessionExpiry();
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

    cookieHeaders.set(
      "set-cookie",
      buildSessionCookie(
        token,
        expires,
        isSecureRequest(ctx.req, authConfig.entra.appBaseUrl),
      ),
    );
    // Clear the binding cookie in the same response. Append a second Set-Cookie.
    // Fresh/Response supports multiple headers via Headers.append.
    cookieHeaders.append("set-cookie", clearBindingCookie(secure));
    return redirect(flow.returnTo, cookieHeaders);
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
    if (value) return decodeURIComponent(value);
  }
  return null;
}
