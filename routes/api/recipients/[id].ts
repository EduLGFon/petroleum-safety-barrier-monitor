// API: /api/recipients/:id - single-recipient admin writes.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";

import {
  deleteRecipient,
  updateRecipient,
} from "../../../lib/server/sql/recipients.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { requireAdminAuth } from "../../../lib/server/auth.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // PATCH { name?, active? } - partial update; 404 when missing.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal("recipients/:id", err, requestId, "Server misconfigured");
    }

    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid recipient id", requestId);
    }
    let body: { name?: unknown; active?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const updated = await updateRecipient(id, body);
      if (!updated) return notFound("Recipient not found", requestId);
      return Response.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("name") || message.includes("active") ||
        message.includes("nothing to update")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "PATCH /api/recipients/:id",
        err,
        requestId,
        "Failed to update recipient",
      );
    }
  },

  // DELETE - removes the recipient; 404 when missing.
  async DELETE(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal("recipients/:id", err, requestId, "Server misconfigured");
    }

    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid recipient id", requestId);
    }
    try {
      const removed = await deleteRecipient(id);
      if (!removed) return notFound("Recipient not found", requestId);
      return Response.json({ ok: true });
    } catch (err) {
      return internal(
        "DELETE /api/recipients/:id",
        err,
        requestId,
        "Failed to delete recipient",
      );
    }
  },
});
