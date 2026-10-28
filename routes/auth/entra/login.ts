// Route: GET /auth/entra/login - starts an Entra OIDC flow.
// This is why it exists: the browser is redirected to Entra with PKCE, state,
// and nonce, while the server keeps the one-time flow in Postgres.
import {
  internal,
  newRequestId,
  rateLimited,
} from "../../../lib/server/errors.ts";

import { loadAuthConfig } from "../../../lib/server/config.ts";

import {
  buildAuthorizationRequestUrl,
  getOidcConfiguration,
} from "../../../lib/server/auth/entra/client.ts";

import {
  buildBindingCookie,
  codeChallenge,
  createFlow,
  generateBindingToken,
  generateCodeVerifier,
  generateNonce,
  generateState,
  isSecureForConfig,
} from "../../../lib/server/auth/entra/flows.ts";

import { safeAuthNext } from "../../../lib/server/page-auth.ts";

import { getSessionTokenFromRequest } from "../../../lib/server/auth/session.ts";

import { hashSessionToken } from "../../../lib/server/auth/session.ts";

import { getSessionUser } from "../../../lib/server/sql/sessions.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { define } from "../../../utils.ts";

function redirect(location: string, headers?: HeadersInit): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
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
      return internal("GET /auth/entra/login", err, requestId, "Login failed");
    }
    if (!authConfig.ssoEnabled || !authConfig.entra) {
      return new Response("Not Found", { status: 404 });
    }
    const already = getSessionTokenFromRequest(ctx.req);
    if (already) {
      const user = await getSessionUser(await hashSessionToken(already));
      if (user?.active) {
        const next = safeAuthNext(
          ctx.url.searchParams.get("next"),
          authConfig.entra.appBaseUrl,
        );
        return Response.redirect(new URL(next, ctx.url), 302);
      }
    }
    const next = safeAuthNext(
      ctx.url.searchParams.get("next"),
      authConfig.entra.appBaseUrl,
    );
    const state = generateState();
    const bindingToken = generateBindingToken();
    const nonce = generateNonce();
    const verifier = generateCodeVerifier();
    const challenge = await codeChallenge(verifier);
    try {
      await createFlow({
        state,
        browserToken: bindingToken,
        nonce,
        codeVerifier: verifier,
        returnTo: next,
        ttlSeconds: authConfig.entra.flowTtlSeconds,
      });
    } catch (err) {
      return internal("GET /auth/entra/login", err, requestId, "Login failed");
    }
    let oidc;
    try {
      oidc = await getOidcConfiguration(authConfig);
    } catch (err) {
      return internal("GET /auth/entra/login", err, requestId, "Login failed");
    }
    const location = buildAuthorizationRequestUrl(
      authConfig,
      oidc,
      state,
      nonce,
      challenge,
    );
    const secure = isSecureForConfig(authConfig, ctx.req);
    const headers = new Headers();
    headers.set(
      "set-cookie",
      buildBindingCookie(
        bindingToken,
        authConfig.entra.flowTtlSeconds,
        secure,
      ),
    );
    headers.set("cache-control", "no-store");
    headers.set("pragma", "no-cache");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    return redirect(location, headers);
  },
});
