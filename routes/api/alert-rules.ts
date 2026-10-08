// API: /api/alert-rules - which events trigger email, admin only.
// This is why it exists: alerts are configurable per category (enabled or
// muted), by landing status, critical-only, recovery, stale days, and
// immediate vs digest delivery. The detector reads active rows.
import {
  badRequest,
  created,
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../lib/server/throttle.ts";

import {
  createAlertRule,
  listAlertRules,
} from "../../lib/server/sql/alert_rules.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../lib/server/auth.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { readJsonBody } from "../../lib/server/validation.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET - lists rules (?activeOnly=1 filters to enabled rows).
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
        "GET /api/alert-rules",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/alert-rules", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    try {
      const activeOnly = ctx.url.searchParams.get("activeOnly") === "1";
      return ok(await listAlertRules(activeOnly), requestId);
    } catch (err) {
      return internal(
        "GET /api/alert-rules",
        err,
        requestId,
        "Failed to fetch rules",
      );
    }
  },

  // POST - creates a rule; duplicate names are rejected as 400.
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
        "POST /api/alert-rules",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("POST /api/alert-rules", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body;
    try {
      const rule = await createAlertRule({
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
      return created(rule, requestId);
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
        message.includes("duplicate") || message.includes("unique")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        "POST /api/alert-rules",
        err,
        requestId,
        "Failed to create rule",
      );
    }
  },
});
