// API: /api/barriers/:id - single wire barrier GET or admin PATCH.
// This is why it exists: authenticated GET returns full barrier metadata;
// admin PATCH updates editable core and sheet fields with input validation.
import {
  authStoreUnavailable,
  denyByCredentials,
  denyDataAuth,
  requireAdminAuth,
  requireDataAuth,
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
  postAlert,
  providerConfigFromEnv,
} from "../../../lib/server/alerts/provider.ts";

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

import { parseIdParam, readJsonBody } from "../../../lib/server/validation.ts";

import { maybeSendProviderImmediate } from "../../../lib/server/alerts/run-provider.ts";

import { getResolverLabels } from "../../../lib/server/sql/vocabularies.ts";

import { listAlertRules } from "../../../lib/server/sql/alert_rules.ts";

import { getOrCreateAuthor } from "../../../lib/server/sql/authors.ts";

import { listRecipients } from "../../../lib/server/sql/recipients.ts";

import { sqlAlertStore } from "../../../lib/server/sql/alerts.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { forRequest } from "../../../lib/server/log.ts";

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
      // Like the dedicated status route below, a matching transition is
      // enqueued (and immediately mailed for immediate rules) - without
      // this the dashboard editor would write history no alert run ever
      // sees, since detection only fires on enqueued transitions.
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
          await transitionBarrierStatus(barrierId, availId, author.id, note);
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
      });

      // Manual contingency overlay (docs/STATUSES.md): Há Contingência?=Sim
      // promotes a stored Degradado/Indisponível to its contingenciado
      // display state, clearing it demotes back. Only when the request did
      // not explicitly set availability (an explicit status wins over the
      // overlay), so a two-field edit in one PATCH never fights itself.
      if (
        body.availabilityId === undefined && updated &&
        hasContingency !== undefined
      ) {
        const { isContingencyFlag } = await import(
          "../../../lib/server/fracttal/barrier-rules.ts"
        );
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
          );
          if (promoted) updated = promoted;
          statusChangedTo = target;
        }
      }

      // Best-effort provider fan-out for the status change above: the
      // transition already committed, so nothing here may fail the
      // response. Enqueue always; violada posts at once when the provider
      // is configured. Failures only log; the poll cycle retries.
      if (statusChangedTo !== undefined) {
        try {
          const [rules, recipients] = await Promise.all([
            listAlertRules(false),
            listRecipients(true),
          ]);
          void rules;
          let provider:
            | Awaited<ReturnType<typeof providerConfigFromEnv>>
            | undefined;
          try {
            provider = providerConfigFromEnv();
          } catch {
            provider = undefined;
          }
          let labels:
            | Awaited<ReturnType<typeof getResolverLabels>>
            | undefined;
          try {
            labels = await getResolverLabels();
          } catch {
            labels = undefined;
          }
          let statusInfo:
            | Awaited<
              import("../../../lib/server/alerts/detect.ts").StatusInfo
            >
            | undefined;
          try {
            const { queryRows } = await import(
              "../../../lib/server/db.ts"
            );
            const rows = await queryRows<
              { id: number; label: string; ok: boolean }
            >(
              `select id, label, is_compliant as ok from availability_statuses`,
            );
            const labelById = new Map(rows.map((r) => [r.id, r.label]));
            const okById = new Map(rows.map((r) => [r.id, r.ok]));
            statusInfo = {
              labelOf: (id: number) =>
                labelById.get(id) ?? `Disponibilidade (${id})`,
              compliantOf: (id: number) => okById.get(id) ?? false,
            };
          } catch {
            statusInfo = undefined;
          }
          const { getBarriersByIds } = await import(
            "../../../lib/server/sql/barriers.ts"
          );
          await maybeSendProviderImmediate({
            store: sqlAlertStore,
            loadBarriers: getBarriersByIds,
            sender: provider
              ? { post: (payload) => postAlert(provider!, payload) }
              : undefined,
            barrier: updated ?? existing,
            statusId: statusChangedTo,
            transitionDate: (updated ?? existing).statusSince.slice(0, 10),
            companyId: provider?.companyId ?? 1,
            appBaseUrl: Deno.env.get("APP_BASE_URL") || undefined,
            recipients: recipients.map((r) => ({
              email: r.email,
              name: r.name,
              phone: r.phone ?? "",
            })),
            logger: forRequest(requestId).line("info"),
            labels,
            statusInfo,
          });
        } catch (err) {
          reqLog.error("immediate fan-out failed", { barrierId, err });
        }
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
