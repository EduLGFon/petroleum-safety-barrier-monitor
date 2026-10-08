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
  type AlertMailer,
  smtpAlertConfigFromEnv,
} from "../../../../lib/server/alerts/mailer.ts";

import {
  getBarrierById,
  transitionBarrierStatus,
} from "../../../../lib/server/sql/barriers.ts";

import {
  routeClientKey,
  writeThrottle,
} from "../../../../lib/server/throttle.ts";

import {
  parseIdParam,
  readJsonBody,
} from "../../../../lib/server/validation.ts";

import { maybeSendImmediate } from "../../../../lib/server/alerts/immediate.ts";

import { getResolverLabels } from "../../../../lib/server/sql/vocabularies.ts";

import { listAlertRules } from "../../../../lib/server/sql/alert_rules.ts";

import { smtpAlertMailer } from "../../../../lib/server/alerts/mailer.ts";

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
      // Best-effort immediate fan-out (hybrid alerts): the transition
      // already committed above, so nothing here may fail the response.
      // Matches enqueue always; immediate rules also send at once when a
      // relay is configured. Failures only log; the digest cron retries.
      try {
        const [rules, recipients] = await Promise.all([
          listAlertRules(false),
          listRecipients(true),
        ]);
        let mailer: AlertMailer | undefined;
        try {
          mailer = smtpAlertMailer(smtpAlertConfigFromEnv());
        } catch {
          mailer = undefined; // no relay: enqueue only, cron sends
        }
        let labels:
          | Awaited<ReturnType<typeof getResolverLabels>>
          | undefined;
        try {
          labels = await getResolverLabels();
        } catch {
          labels = undefined;
        }
        const fanout = await maybeSendImmediate({
          store: sqlAlertStore,
          barrier: updated,
          statusId: statusId as number,
          transitionDate: updated.statusSince.slice(0, 10),
          rules,
          hasAnyRule: rules.length > 0,
          mailer,
          recipients,
          logger: forRequest(requestId).line("info"),
          labels,
          brand: Deno.env.get("COMPANY_NAME") || undefined,
          dashboardUrl: Deno.env.get("APP_BASE_URL") || undefined,
        });
        if (fanout.matched) {
          reqLog.info("immediate fan-out finished", {
            barrierId,
            enqueued: fanout.enqueued,
            emailed: fanout.emailed,
          });
        }
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
