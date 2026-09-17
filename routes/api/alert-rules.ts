// API: /api/alert-rules - which events trigger email, admin only.
// This is why it exists: alerts are configurable per category (enabled or
// muted), by landing status, critical-only, recovery, stale days, and
// immediate vs digest delivery. The detector reads active rows.
import {
  badRequest,
  internal,
  newRequestId,
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

import { loadServerConfig } from "../../lib/server/config.ts";

import { requireAdminAuth } from "../../lib/server/auth.ts";

import { unauthorized } from "../../lib/server/errors.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET - lists rules (?activeOnly=1 filters to enabled rows).
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
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
    try {
      const activeOnly = ctx.url.searchParams.get("activeOnly") === "1";
      return Response.json(await listAlertRules(activeOnly));
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
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return unauthorized(auth.message, requestId);
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
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const created = await createAlertRule({
        name: body.name,
        categoryId: body.categoryId,
        toStatusId: body.toStatusId,
        criticalOnly: body.criticalOnly,
        includeRecovery: body.includeRecovery,
        staleDays: body.staleDays,
        notifyImmediate: body.notifyImmediate,
        active: body.active,
      });
      return Response.json(created, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("name") || message.includes("category") ||
        message.includes("toStatus") || message.includes("critical") ||
        message.includes("includeRecovery") || message.includes("staleDays") ||
        message.includes("notifyImmediate") || message.includes("active") ||
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
