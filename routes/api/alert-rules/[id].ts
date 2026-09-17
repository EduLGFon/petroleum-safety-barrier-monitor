// API: /api/alert-rules/:id - single-rule admin writes.
// This is why it exists: enabling or muting a category is a PATCH on the
// rule's active flag; deleting removes the trigger entirely.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
} from "../../../lib/server/errors.ts";

import {
  deleteAlertRule,
  updateAlertRule,
} from "../../../lib/server/sql/alert_rules.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { rateLimited, unauthorized } from "../../../lib/server/errors.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { requireAdminAuth } from "../../../lib/server/auth.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // PATCH - partial update; 404 when missing.
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
      return internal(
        "PATCH /api/alert-rules/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid rule id", requestId);
    }
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const updated = await updateAlertRule(id, {
        name: body.name,
        categoryId: body.categoryId,
        toStatusId: body.toStatusId,
        criticalOnly: body.criticalOnly,
        includeRecovery: body.includeRecovery,
        staleDays: body.staleDays,
        notifyImmediate: body.notifyImmediate,
        active: body.active,
      });
      if (!updated) return notFound("Rule not found", requestId);
      return Response.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("name") || message.includes("category") ||
        message.includes("toStatus") || message.includes("critical") ||
        message.includes("includeRecovery") || message.includes("staleDays") ||
        message.includes("notifyImmediate") || message.includes("active") ||
        message.includes("nothing to update") ||
        message.includes("duplicate") ||
        message.includes("unique")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "PATCH /api/alert-rules/:id",
        err,
        requestId,
        "Failed to update rule",
      );
    }
  },

  // DELETE - removes the rule; 404 when missing.
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
      return internal(
        "DELETE /api/alert-rules/:id",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest("Invalid rule id", requestId);
    }
    try {
      const removed = await deleteAlertRule(id);
      if (!removed) return notFound("Rule not found", requestId);
      return Response.json({ ok: true });
    } catch (err) {
      return internal(
        "DELETE /api/alert-rules/:id",
        err,
        requestId,
        "Failed to delete rule",
      );
    }
  },
});
