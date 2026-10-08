// API: /api/alert-rules/:id - single-rule admin writes.
// This is why it exists: enabling or muting a category is a PATCH on the
// rule's active flag; deleting removes the trigger entirely.
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

import {
  deleteAlertRule,
  updateAlertRule,
} from "../../../lib/server/sql/alert_rules.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import { parseIdParam, readJsonBody } from "../../../lib/server/validation.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // PATCH - partial update; 404 when missing.
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
        "PATCH /api/alert-rules/:id",
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
        "PATCH /api/alert-rules/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid rule id", requestId);
    }
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body;
    try {
      const updated = await updateAlertRule(id, {
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        toStatusId: body.toStatusId,
        criticalOnly: body.criticalOnly,
        includeRecovery: body.includeRecovery,
        staleDays: body.staleDays,
        notifyImmediate: body.notifyImmediate,
        active: body.active,
        categoryIds: body.categoryIds,
        fromStatusIds: body.fromStatusIds,
        toStatusIds: body.toStatusIds,
        locationIds: body.locationIds,
        criticalityIds: body.criticalityIds,
        typologyIds: body.typologyIds,
        groupingIds: body.groupingIds,
        ownerIds: body.ownerIds,
        urgency: body.urgency,
        onlyNoActionPlan: body.onlyNoActionPlan,
        onTransition: body.onTransition,
        cooldownMinutes: body.cooldownMinutes,
        maxPerDay: body.maxPerDay,
        quietStartHour: body.quietStartHour,
        quietEndHour: body.quietEndHour,
        activeDays: body.activeDays,
        priority: body.priority,
        validFrom: body.validFrom,
        validTo: body.validTo,
        staleRepeatDays: body.staleRepeatDays,
      });
      if (!updated) return notFound("Rule not found", requestId);
      return ok(updated, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("name") || message.includes("description") ||
        message.includes("category") || message.includes("toStatus") ||
        message.includes("fromStatus") || message.includes("critical") ||
        message.includes("includeRecovery") || message.includes("staleDays") ||
        message.includes("staleRepeat") ||
        message.includes("notifyImmediate") ||
        message.includes("active") || message.includes("urgency") ||
        message.includes("location") || message.includes("typology") ||
        message.includes("grouping") || message.includes("owner") ||
        message.includes("cooldown") || message.includes("maxPerDay") ||
        message.includes("quiet") || message.includes("activeDays") ||
        message.includes("priority") || message.includes("validFrom") ||
        message.includes("validTo") || message.includes("actionPlan") ||
        message.includes("onTransition") ||
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
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "DELETE /api/alert-rules/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid rule id", requestId);
    }
    try {
      const removed = await deleteAlertRule(id);
      if (!removed) return notFound("Rule not found", requestId);
      return ok({ ok: true }, requestId);
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
