// Shared API request guard - throttle + config + auth scaffolding.
// Why it exists: most route handlers repeat the same sequence (throttle,
// loadServerConfig, auth check) before their business logic; centralizing it
// keeps the envelopes and request ids consistent and shrinks handler bodies.
import {
  authStoreUnavailable,
  denyByCredentials,
  denyDataAuth,
  requireAdminAuth,
  requireAuthenticated,
  requireDataAuth,
  type DataAuth,
} from "./auth.ts";

import {
  internal,
  newRequestId,
  rateLimited,
} from "./errors.ts";

import { readThrottle, routeClientKey, writeThrottle } from "./throttle.ts";

import { loadServerConfig } from "./config.ts";

export type AuthLevel = "none" | "user" | "admin" | "data";
export type ThrottleKind = "read" | "write";

export interface GuardOptions {
  kind: ThrottleKind;
  auth: AuthLevel;
  label: string;
}

export interface GuardResult {
  requestId: string;
  response?: Response;
  dataAuth?: DataAuth;
}

// guardRequest: runs throttle + config + auth and returns either a ready
// requestId or a Response that the handler must return immediately.
export async function guardRequest(
  ctx: unknown,
  opts: GuardOptions,
): Promise<GuardResult> {
  const requestId = newRequestId();
  const req = (ctx as { req: Request }).req;
  const throttle = opts.kind === "read" ? readThrottle : writeThrottle;
  const limit = throttle.check(routeClientKey(ctx));
  if (!limit.allowed) {
    return {
      requestId,
      response: rateLimited("too many requests", requestId, limit.retryAfterMs),
    };
  }
  try {
    loadServerConfig();
  } catch (err) {
    return {
      requestId,
      response: internal(opts.label, err, requestId, "Server misconfigured"),
    };
  }
  if (opts.auth === "none") return { requestId };
  if (opts.auth === "data") {
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(req);
    } catch (err) {
      return {
        requestId,
        response: authStoreUnavailable(opts.label, err, requestId),
      };
    }
    if (!dataAuth.ok) {
      return {
        requestId,
        response: denyDataAuth(dataAuth, requestId),
      };
    }
    return { requestId, dataAuth };
  }
  let auth;
  try {
    auth = opts.auth === "admin"
      ? await requireAdminAuth(req)
      : await requireAuthenticated(req);
  } catch (err) {
    return {
      requestId,
      response: authStoreUnavailable(opts.label, err, requestId),
    };
  }
  if (!auth.ok) {
    return {
      requestId,
      response: denyByCredentials(req, auth.message, requestId),
    };
  }
  return { requestId };
}