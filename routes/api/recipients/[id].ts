// API: /api/recipients/:id - single-recipient admin writes.
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
  deleteRecipient,
  updateRecipient,
} from "../../../lib/server/sql/recipients.ts";

import { routeClientKey, writeThrottle } from "../../../lib/server/throttle.ts";

import {
  parseIdParam,
  readJsonBody,
  ValidationError,
} from "../../../lib/server/validation.ts";

import { loadServerConfig } from "../../../lib/server/config.ts";

import { define } from "../../../utils.ts";

import { denyIfCrossSite } from "../../../lib/server/csrf.ts";

export const handler = define.handlers({
  // PATCH { name?, phone?, active? } - partial update; 404 when missing.
  async PATCH(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "PATCH /api/recipients/:id",
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
        "PATCH /api/recipients/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);

    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid recipient id", requestId);
    }
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as {
      name?: unknown;
      phone?: unknown;
      active?: unknown;
    };
    try {
      const updated = await updateRecipient(id, body);
      if (!updated) return notFound("Recipient not found", requestId);
      return ok(updated, requestId);
    } catch (err) {
      // Typed classification: a ValidationError is a client-input rejection
      // and keeps its 400. Everything else is internal - database text never
      // reaches a client, and no error is classified by matching words in a
      // message.
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      return internal(
        "PATCH /api/recipients/:id",
        err,
        requestId,
        "Failed to update recipient",
      );
    }
  },

  // DELETE - removes the recipient; 404 when missing.
  async DELETE(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "DELETE /api/recipients/:id",
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
        "DELETE /api/recipients/:id",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);

    const id = parseIdParam(ctx.params.id);
    if (id === undefined) {
      return badRequest("Invalid recipient id", requestId);
    }
    try {
      const removed = await deleteRecipient(id);
      if (!removed) return notFound("Recipient not found", requestId);
      return ok({ ok: true }, requestId);
    } catch (err) {
      return internal(
        "DELETE /api/recipients/:id",
        err,
        requestId,
        "Failed to delete recipient",
      );
    }
  },
});
