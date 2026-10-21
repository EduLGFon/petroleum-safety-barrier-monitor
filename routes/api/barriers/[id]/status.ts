// API: PATCH /api/barriers/:id/status - status transition write path.
// This is why it exists: the one sanctioned way to change availability,
// via record_status_change() (see db/schema.sql). Guarded by admin session
// or ADMIN_TOKEN (fail-closed when neither is present); reads require login.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  rateLimited,
} from "../../../../lib/server/errors.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../../../lib/server/auth.ts";

import {
  getBarrierById,
  transitionBarrierStatus,
} from "../../../../lib/server/sql/barriers.ts";

import {
  postAlert,
  providerConfigFromEnv,
} from "../../../../lib/server/alerts/provider.ts";

import { maybeSendProviderImmediate } from "../../../../lib/server/alerts/run-provider.ts";

import {
  routeClientKey,
  writeThrottle,
} from "../../../../lib/server/throttle.ts";

import {
  parseIdParam,
  readJsonBody,
} from "../../../../lib/server/validation.ts";

import { getResolverLabels } from "../../../../lib/server/sql/vocabularies.ts";

import { listAlertRules } from "../../../../lib/server/sql/alert_rules.ts";

import { listRecipients } from "../../../../lib/server/sql/recipients.ts";

import { getOrCreateAuthor } from "../../../../lib/server/sql/authors.ts";

import { sqlAlertStore } from "../../../../lib/server/sql/alerts.ts";

import { loadServerConfig } from "../../../../lib/server/config.ts";

import { forRequest } from "../../../../lib/server/log.ts";

import { define } from "../../../../utils.ts";

interface StatusBody {
  statusId?: number;
  authorId?: number;
  note?: string;
}

export const handler = define.handlers({
  // PATCH barrier status via transitionBarrierStatus. Session admins may
  // omit authorId (derived from their user name); token callers keep the
  // explicit authorId contract.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const reqLog = forRequest(requestId, "status");
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited(
        "too many requests",
        requestId,
        limit.retryAfterMs,
      );
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
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        `PATCH /api/barriers/${ctx.params.id}/status`,
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
    const body = parsed.body as StatusBody;

    const { statusId, note } = body;
    let authorId = body.authorId;
    if (!Number.isInteger(statusId) || (statusId as number) < 0) {
      return badRequest(
        "statusId is a required non-negative integer",
        requestId,
      );
    }
    if (authorId === undefined && auth.user !== null) {
      try {
        const author = await getOrCreateAuthor(
          auth.user.name || auth.user.email,
        );
        authorId = author.id;
      } catch (err) {
        return internal(
          `PATCH /api/barriers/${ctx.params.id}/status`,
          err,
          requestId,
          "Failed to resolve author",
        );
      }
    }
    if (!Number.isInteger(authorId) || (authorId as number) < 0) {
      return badRequest(
        "authorId is required (or log in so it derives from your user)",
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
      // Same-status retry is a no-op: no history row, no alert fan-out.
      // transitionBarrierStatus() guards this too; this early return
      // additionally skips the immediate-send path below.
      if (existing.availabilityId === statusId) {
        return ok(existing, requestId);
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
      // Best-effort provider fan-out (hybrid alerts): the transition
      // already committed above, so nothing here may fail the response.
      // Enqueue always; violada posts at once when the provider is
      // configured. Failures only log; the poll cycle retries.
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
          provider = undefined; // no token: enqueue only, cycle sends
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
            import("../../../../lib/server/alerts/detect.ts").StatusInfo
          >
          | undefined;
        try {
          const { queryRows } = await import(
            "../../../../lib/server/db.ts"
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
          "../../../../lib/server/sql/barriers.ts"
        );
        const fanout = await maybeSendProviderImmediate({
          store: sqlAlertStore,
          loadBarriers: getBarriersByIds,
          sender: provider
            ? { post: (payload) => postAlert(provider!, payload) }
            : undefined,
          barrier: updated,
          statusId: statusId as number,
          transitionDate: updated.statusSince.slice(0, 10),
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
        reqLog.info("provider fan-out finished", {
          barrierId,
          enqueued: fanout.enqueued,
          posted: fanout.posted,
        });
      } catch (err) {
        reqLog.error("immediate fan-out failed", {
          barrierId,
          err,
        });
      }
      return ok(updated, requestId);
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
