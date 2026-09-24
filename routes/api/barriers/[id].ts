// API: /api/barriers/:id - single wire barrier GET or admin PATCH.
// This is why it exists: authenticated GET returns full barrier metadata;
// admin PATCH updates editable core and sheet fields with input validation.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../../lib/server/errors.ts";
import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../../lib/server/throttle.ts";
import {
  getBarrierById,
  transitionBarrierStatus,
  updateBarrier,
} from "../../../lib/server/sql/barriers.ts";
import {
  denyByCredentials,
  requireAdminAuth,
  requireDataAuth,
} from "../../../lib/server/auth.ts";
import { getOrCreateAuthor } from "../../../lib/server/sql/authors.ts";
import { loadServerConfig } from "../../../lib/server/config.ts";
import { define } from "../../../utils.ts";

function optStr(raw: unknown, max = 2000): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new Error("must be a string");
  return raw.slice(0, max);
}

function optInt(raw: unknown, name: string): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return raw;
}

export const handler = define.handlers({
  // GET single barrier by numeric id; 400 invalid, 404 when missing.
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
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Server misconfigured",
      );
    }
    const dataAuth = await requireDataAuth(ctx.req);
    if (!dataAuth.ok) {
      return dataAuth.anonymous
        ? notFound("not found", requestId)
        : unauthorized(dataAuth.message, requestId);
    }

    const barrierId = Number(ctx.params.id);
    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return badRequest("Invalid barrier id", requestId);
    }

    try {
      const barrier = await getBarrierById(barrierId);
      if (!barrier) return notFound("Barrier not found", requestId);
      return Response.json(barrier);
    } catch (err) {
      return internal(
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Failed to fetch barrier",
      );
    }
  },

  // PATCH - updates editable barrier fields; admin only.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const auth = await requireAdminAuth(ctx.req);
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        `PATCH /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Server misconfigured",
      );
    }

    const barrierId = Number(ctx.params.id);
    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return badRequest("Invalid barrier id", requestId);
    }

    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }

    try {
      const existing = await getBarrierById(barrierId);
      if (!existing) return notFound("Barrier not found", requestId);

      const tag = optStr(body.tag, 200);
      const locationId = optInt(body.locationId, "locationId");
      const typologyId = optInt(body.typologyId, "typologyId");
      const categoryId = optInt(body.categoryId, "categoryId");
      const groupingId = optInt(body.groupingId, "groupingId");
      const ownerId = body.ownerId === null
        ? null
        : optInt(body.ownerId, "ownerId");
      const criticalityId = optInt(body.criticalityId, "criticalityId");
      const comments = optStr(body.comments);
      const actionPlan = optStr(body.actionPlan);
      const origin = optStr(body.origin);
      const installLocal = optStr(body.installLocal);
      const equipTypology = optStr(body.equipTypology);
      const fieldInstalled = optStr(body.fieldInstalled, 200);
      const fieldOperational = optStr(body.fieldOperational, 200);
      const opStatus = optStr(body.opStatus, 200);
      const hasMaintPlan = optStr(body.hasMaintPlan, 200);
      const planFollowed = optStr(body.planFollowed, 200);
      const failureFree = optStr(body.failureFree, 200);
      const maintStatus = optStr(body.maintStatus, 200);
      const hasContingency = optStr(body.hasContingency, 200);
      const contingencyDesc = optStr(body.contingencyDesc);
      const evidenceCode = optStr(body.evidenceCode, 200);
      const degradationDesc = optStr(body.degradationDesc);
      const extraComments = optStr(body.extraComments);

      // Status change routes through record_status_change for audit/alerts.
      if (
        body.availabilityId !== undefined &&
        body.availabilityId !== existing.availabilityId
      ) {
        const availId = optInt(body.availabilityId, "availabilityId");
        if (availId !== undefined) {
          const author = await getOrCreateAuthor(
            auth.user?.name || auth.user?.email || "admin",
          );
          const note = typeof body.statusNote === "string"
            ? body.statusNote
            : "Edição de barreira";
          await transitionBarrierStatus(barrierId, availId, author.id, note);
        }
      }

      const updated = await updateBarrier(barrierId, {
        tag,
        locationId,
        typologyId,
        categoryId,
        groupingId,
        ownerId,
        criticalityId,
        comments,
        actionPlan,
        origin,
        installLocal,
        equipTypology,
        fieldInstalled,
        fieldOperational,
        opStatus,
        hasMaintPlan,
        planFollowed,
        failureFree,
        maintStatus,
        hasContingency,
        contingencyDesc,
        evidenceCode,
        degradationDesc,
        extraComments,
      });

      return Response.json(updated ?? existing);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("must be") || message.includes("Invalid") ||
        message.includes("string")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        `PATCH /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Failed to update barrier",
      );
    }
  },
});
