// API: /api/access-groups/:id - single group admin writes.
import {
  deleteAccessGroup,
  getAccessGroup,
  updateAccessGroup,
} from "../../../lib/server/sql/access-groups.ts";

import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../lib/server/auth.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { parseIdParam, readJsonBody } from "../../../lib/server/validation.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/access-groups/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/access-groups/:id", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) return badRequest("Invalid group id", requestId);
    try {
      const group = await getAccessGroup(id);
      if (!group) return notFound("Group not found", requestId);
      return ok(group, requestId);
    } catch (err) {
      return internal(
        "GET /api/access-groups/:id",
        err,
        requestId,
        "Failed to fetch group",
      );
    }
  },

  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "PATCH /api/access-groups/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "PATCH /api/access-groups/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) return badRequest("Invalid group id", requestId);
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      name?: unknown;
      description?: unknown;
      locationIds?: unknown;
      userIds?: unknown;
    };
    const patch: {
      name?: string;
      description?: string;
      locationIds?: number[];
      userIds?: number[];
    } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return badRequest("name is required", requestId);
      }
      patch.name = body.name;
    }
    if (body.description !== undefined) {
      patch.description = typeof body.description === "string"
        ? body.description
        : "";
    }
    if (body.locationIds !== undefined) {
      patch.locationIds = Array.isArray(body.locationIds)
        ? body.locationIds.filter((n): n is number => typeof n === "number")
        : [];
    }
    if (body.userIds !== undefined) {
      patch.userIds = Array.isArray(body.userIds)
        ? body.userIds.filter((n): n is number => typeof n === "number")
        : [];
    }
    try {
      const updated = await updateAccessGroup(id, patch);
      if (!updated) return notFound("Group not found", requestId);
      return ok(updated, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("unique") || message.includes("duplicate")) {
        return badRequest("group name already exists", requestId);
      }
      return internal(
        "PATCH /api/access-groups/:id",
        err,
        requestId,
        "Failed to update group",
      );
    }
  },

  async DELETE(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "DELETE /api/access-groups/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "DELETE /api/access-groups/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) return badRequest("Invalid group id", requestId);
    try {
      const removed = await deleteAccessGroup(id);
      if (!removed) return notFound("Group not found", requestId);
      return ok({ ok: true }, requestId);
    } catch (err) {
      return internal(
        "DELETE /api/access-groups/:id",
        err,
        requestId,
        "Failed to delete group",
      );
    }
  },
});
