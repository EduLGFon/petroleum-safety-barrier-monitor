// API: PATCH /api/barriers/:id/status - status transition write path.
// This is why it exists: the one sanctioned way to change disponibilidade,
// via record_status_change() (see db/schema.sql). Guarded by ADMIN_TOKEN
// (fail-closed when unset); reads stay open, writes do not.
import {
  getBarrierById,
  transitionBarrierStatus,
} from "../../../../lib/server/sql/barriers.ts";
import { checkAdminAuth } from "../../../../lib/server/auth.ts";
import { loadServerConfig } from "../../../../lib/server/config.ts";
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../../../lib/server/errors.ts";
import {
  routeClientKey,
  writeThrottle,
} from "../../../../lib/server/throttle.ts";
import { define } from "../../../../utils.ts";

interface StatusBody {
  statusId?: number;
  authorId?: number;
  note?: string;
}

export const handler = define.handlers({
  // PATCH barrier status via transitionBarrierStatus; admin token first,
  // then id and body validation.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited(
        "too many requests",
        requestId,
        limit.retryAfterMs,
      );
    }
    const auth = checkAdminAuth(ctx.req);
    if (!auth.ok) {
      return unauthorized(auth.message, requestId);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        `PATCH /api/barriers/${ctx.params.id}/status`,
        err,
        requestId,
        "Server misconfigured",
      );
    }

    const barrierId = Number(ctx.params.id);

    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return badRequest("Invalid barrier id", requestId);
    }

    let body: StatusBody;
    try {
      body = await ctx.req.json() as StatusBody;
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }

    const { statusId, authorId, note } = body;
    if (
      !Number.isInteger(statusId) || (statusId as number) < 0 ||
      !Number.isInteger(authorId) || (authorId as number) < 0
    ) {
      return badRequest(
        "statusId and authorId are required non-negative integers",
        requestId,
      );
    }
    if (note !== undefined && typeof note !== "string") {
      return badRequest("note must be a string", requestId);
    }

    try {
      // record_status_change() raises on a missing id (500), so the
      // existence check comes first to keep 404 semantics.
      const existing = await getBarrierById(barrierId);
      if (!existing) {
        return notFound("Barrier not found", requestId);
      }
      const updated = await transitionBarrierStatus(
        barrierId,
        statusId as number,
        authorId as number,
        (note ?? "").slice(0, 2000),
      );
      if (!updated) {
        return notFound("Barrier not found", requestId);
      }
      return Response.json(updated);
    } catch (err) {
      return internal(
        `PATCH /api/barriers/${ctx.params.id}/status`,
        err,
        requestId,
        "Failed to update barrier status",
      );
    }
  },
});
