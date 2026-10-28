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

import { readJsonBody } from "../../lib/server/validation.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
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
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      name?: unknown;
      description?: unknown;
      locationIds?: unknown;
      userIds?: unknown;
    };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return badRequest("name is required", requestId);
    }
    const locationIds = Array.isArray(body.locationIds)
      ? body.locationIds.filter((n): n is number => typeof n === "number")
      : [];
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((n): n is number => typeof n === "number")
      : [];
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
