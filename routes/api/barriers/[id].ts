// API: /api/barriers/:id - single wire barrier GET or admin PATCH.
// This is why it exists: authenticated GET returns full barrier metadata;
// admin PATCH updates editable core and sheet fields with input validation.
import {
  authStoreUnavailable,
  denyByCredentials,
  denyDataAuth,
  requireAdminAuth,
  requireDataAuth,
  resolveAllowedLocationIds,
} from "../../../lib/server/auth.ts";

import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  okWithEtag,
  rateLimited,
} from "../../../lib/server/errors.ts";

import {
  getBarrierById,
  transitionBarrierStatus,
  updateBarrier,
} from "../../../lib/server/sql/barriers.ts";

import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../../lib/server/throttle.ts";

import { fanoutStatusChange } from "../../../lib/server/alerts/status-fanout.ts";

import { parseIdParam, readJsonBody } from "../../../lib/server/validation.ts";

import { getOrCreateAuthor } from "../../../lib/server/sql/authors.ts";

import { isOwnableField } from "../../../lib/field-ownership.ts";

import { isContingencyFlag } from "../../../lib/server/fracttal/barrier-rules.ts";

import { withTx } from "../../../lib/server/db.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { forRequest } from "../../../lib/server/log.ts";

import { define } from "../../../utils.ts";

import { denyIfCrossSite } from "../../../lib/server/csrf.ts";

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

// optReleaseFields: validates the per-field "back to sync" list. Unknown or
// non-string entries are a 400 (the route maps "must be" to badRequest).
function optReleaseFields(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("releaseFields must be an array");
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !isOwnableField(item)) {
      throw new Error(`releaseFields must be known field names, got ${item}`);
    }
    out.add(item);
  }
  return [...out];
}

export const handler = define.handlers({
  // GET single barrier by numeric id; 400 invalid, 404 when missing.
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
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let dataAuth;
    try {
      dataAuth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        `GET /api/barriers/${ctx.params.id}`,
        err,
        requestId,
      );
    }
    if (!dataAuth.ok) return denyDataAuth(dataAuth, requestId);

    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }

    try {
      // Admins may audit soft-deleted rows by id; everyone else keeps the
      // live-only view so deleted barriers stay hidden by default.
      const barrier = await getBarrierById(barrierId, {
        includeDeleted: dataAuth.role === "admin",
      });
      if (!barrier) return notFound("Barrier not found", requestId);
      // SECURITY: station access scope.
      if (dataAuth.role !== "admin") {
        const allowed = resolveAllowedLocationIds(dataAuth);
        if (allowed !== null && !allowed.includes(barrier.locationId)) {
          return notFound("Barrier not found", requestId);
        }
      }
      return okWithEtag(ctx.req, barrier, requestId);
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
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const reqLog = forRequest(requestId, "barrier");
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
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
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        `PATCH /api/barriers/${ctx.params.id}`,
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);

    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }

    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body;

    try {
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
      // Per-field "back to sync": released keys leave manual_fields and
      // follow Fracttal again on the next sweep (values stay until then).
      const releaseFields = optReleaseFields(body.releaseFields);

      // One transaction for the whole edit: status transition, metadata
      // update, and contingency overlay commit together or not at all. The
      // row lock inside transitionBarrierStatus/updateBarrier serializes
      // concurrent edits and the manual_fields read-modify-write.
      const result = await withTx(async (tx) => {
        const existing = await getBarrierById(barrierId, { query: tx });
        if (!existing) {
          return {
            existing: null,
            updated: null,
            statusChangedTo: undefined as number | undefined,
          };
        }

        // Status change routes through record_status_change for audit/alerts.
        // A matching transition is enqueued after commit; detection only
        // fires on enqueued transitions.
        let statusChangedTo: number | undefined;
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
            await transitionBarrierStatus(
              barrierId,
              availId,
              author.id,
              note,
              tx,
            );
            statusChangedTo = availId;
          }
        }

        let updated = await updateBarrier(barrierId, {
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
        }, { releaseFields, query: tx });

        // Manual contingency overlay (docs/STATUSES.md): Há Contingência?=Sim
        // promotes a stored Degradado/Indisponível to its contingenciado
        // display state, clearing it demotes back. Only when the request did
        // not explicitly set availability (an explicit status wins over the
        // overlay), so a two-field edit in one PATCH never fights itself.
        if (
          body.availabilityId === undefined && updated &&
          hasContingency !== undefined
        ) {
          const flag = isContingencyFlag(updated.hasContingency);
          let target: number | undefined;
          if (flag && updated.availabilityId === 4) target = 3;
          else if (flag && updated.availabilityId === 5) target = 2;
          else if (!flag && updated.availabilityId === 3) target = 4;
          else if (!flag && updated.availabilityId === 2) target = 5;
          if (target !== undefined) {
            const author = await getOrCreateAuthor(
              auth.user?.name || auth.user?.email || "admin",
            );
            const promoted = await transitionBarrierStatus(
              barrierId,
              target,
              author.id,
              flag ? "Contingência registrada" : "Contingência removida",
              tx,
            );
            if (promoted) updated = promoted;
            statusChangedTo = target;
          }
        }

        return { existing, updated, statusChangedTo };
      });

      if (!result.existing) return notFound("Barrier not found", requestId);
      const { existing, updated, statusChangedTo } = result;

      // Best-effort provider fan-out: the transition is already committed,
      // so a slow third party never holds the admin's save open.
      if (statusChangedTo !== undefined) {
        const barrier = updated ?? existing;
        void fanoutStatusChange({
          barrier,
          statusId: statusChangedTo,
          historyId: barrier.statusHistory.at(-1)?.id,
          requestId,
        }).catch((err) => {
          reqLog.error("immediate fan-out failed", { barrierId, err });
        });
      }

      return ok(updated ?? existing, requestId);
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
