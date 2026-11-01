// API: /api/access-groups - admin-managed station-scoped access groups.
import {
  badRequest,
  created,
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../lib/server/auth.ts";

import {
  createAccessGroup,
  listAccessGroups,
} from "../../lib/server/sql/access-groups.ts";

import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../lib/server/throttle.ts";

import { readJsonBodyCapped } from "../../lib/server/validation.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { define } from "../../utils.ts";

import { denyIfCrossSite } from "../../lib/server/csrf.ts";

// parseIdList: strict positive-integer list. Throws on any non-number,
// string, float, NaN, or non-positive entry so bad ids 400 instead of
// silently dropping to an empty scope.
function parseIdList(raw: unknown, name: string): number[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`${name} must be an array`);
  return raw.map((n) => {
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) {
      throw new Error(`${name} must be positive integers`);
    }
    return n;
  });
}

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/access-groups",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/access-groups", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    try {
      return okWithEtag(ctx.req, await listAccessGroups(), requestId);
    } catch (err) {
      return internal(
        "GET /api/access-groups",
        err,
        requestId,
        "Failed to fetch groups",
      );
    }
  },

  async POST(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "POST /api/access-groups",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("POST /api/access-groups", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const parsed = await readJsonBodyCapped(ctx.req, 10_000);
    if (!parsed.ok) {
      return badRequest(
        parsed.reason === "too-large"
          ? "Request body is too large"
          : "Invalid JSON body",
        requestId,
      );
    }
    const body = parsed.body as {
      name?: unknown;
      description?: unknown;
      locationIds?: unknown;
      userIds?: unknown;
    };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return badRequest("name is required", requestId);
    }
    let locationIds: number[];
    let userIds: number[];
    try {
      locationIds = parseIdList(body.locationIds, "locationIds");
      userIds = parseIdList(body.userIds, "userIds");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return badRequest(message, requestId);
    }
    try {
      const group = await createAccessGroup({
        name: body.name,
        description: typeof body.description === "string"
          ? body.description
          : "",
        locationIds,
        userIds,
      });
      return created(group, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("unique") || message.includes("duplicate")) {
        return badRequest("group name already exists", requestId);
      }
      return internal(
        "POST /api/access-groups",
        err,
        requestId,
        "Failed to create group",
      );
    }
  },
});
