// Route: GET /auth/entra/frontchannel-logout - optional Entra front-channel logout.
// This is why it exists: Entra can ask the app to end sessions in a hidden
// iframe. The endpoint validates the issuer and unguessable sid, then returns
// 200 without revealing whether any session matched.
import { newRequestId, rateLimited } from "../../../lib/server/errors.ts";

import { loadAuthConfig } from "../../../lib/server/config.ts";

import { sha256Hex } from "../../../lib/server/auth/entra/flows.ts";

import { deleteSessionsBySidHash } from "../../../lib/server/sql/sessions.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { define } from "../../../utils.ts";

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
    } catch {
      return new Response("Not Found", { status: 404 });
    }
    if (
      !authConfig.ssoEnabled || !authConfig.entra ||
      !authConfig.entra.frontChannelLogoutEnabled
    ) {
      return new Response("Not Found", { status: 404 });
    }
    const entra = authConfig.entra;
    const iss = ctx.url.searchParams.get("iss");
    const sid = ctx.url.searchParams.get("sid");
    if (iss !== `https://login.microsoftonline.com/${entra.tenantId}/v2.0`) {
      return new Response("ok", { status: 200 });
    }
    if (typeof sid !== "string" || sid === "" || sid.length > 256) {
      return new Response("ok", { status: 200 });
    }
    try {
      const hash = await sha256Hex(`entra-sid:v1:${entra.tenantId}:${sid}`);
      await deleteSessionsBySidHash(hash);
    } catch {
      // Best effort: Entra retries on non-200, so always answer 200.
    }
    return new Response("ok", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "frame-ancestors https://login.microsoftonline.com",
      },
    });
  },
});
