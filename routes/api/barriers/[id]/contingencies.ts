// API: contingency links, eligible candidates, and optional MOC/risk references.
import {
  addBarrierContingency,
  listBarrierContingencies,
  removeBarrierContingency,
  updateBarrierContingency,
} from "../../../../lib/server/sql/contingencies.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  denyDataAuth,
  requireAdminAuth,
  requireDataAuth,
} from "../../../../lib/server/auth.ts";

import {
  normalizeOptionalReference,
  parseIdParam,
  parsePositiveId,
  readJsonBodyCapped,
} from "../../../../lib/server/validation.ts";

import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  ok,
  okWithEtag,
  rateLimited,
} from "../../../../lib/server/errors.ts";

import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../../../lib/server/throttle.ts";

import { getBarrierById } from "../../../../lib/server/sql/barriers.ts";

import { loadServerConfig } from "../../../../lib/server/config.ts";

import { define } from "../../../../utils.ts";

function loadConfig(
  method: string,
  id: string | undefined,
  requestId: string,
): Response | null {
  try {
    loadServerConfig();
    return null;
  } catch (err) {
    return internal(
      `${method} /api/barriers/${id}/contingencies`,
      err,
      requestId,
      "Server misconfigured",
    );
  }
}

async function getDataAuth(
  req: Request,
  requestId: string,
): Promise<
  | { ok: true; role: "admin" | "user" }
  | { response: Response }
> {
  try {
    const auth = await requireDataAuth(req);
    if (!auth.ok) return { response: denyDataAuth(auth, requestId) };
    return { ok: true, role: auth.role };
  } catch (err) {
    return {
      response: authStoreUnavailable(
        "GET /api/barriers/:id/contingencies",
        err,
        requestId,
      ),
    };
  }
}

export const handler = define.handlers({
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const configError = loadConfig("GET", ctx.params.id, requestId);
    if (configError) return configError;
    const auth = await getDataAuth(ctx.req, requestId);
    if ("response" in auth) return auth.response;
    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    const rawQuery = ctx.url.searchParams.get("q");
    if (rawQuery !== null && rawQuery.length > 200) {
      return badRequest("Search query is too long", requestId);
    }
    try {
      const barrier = await getBarrierById(barrierId, {
        includeDeleted: auth.role === "admin",
      });
      if (
        !barrier || (auth.role !== "admin" &&
          (barrier.deletedAt !== null || barrier.isActive === false))
      ) {
        return notFound("Barrier not found", requestId);
      }
      const data = await listBarrierContingencies(
        barrierId,
        rawQuery?.trim() ?? "",
        auth.role === "admin",
      );
      return await okWithEtag(ctx.req, data, requestId);
    } catch (err) {
      return internal(
        `GET /api/barriers/${barrierId}/contingencies`,
        err,
        requestId,
        "Failed to fetch contingencies",
      );
    }
  },

  async POST(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const configError = loadConfig("POST", ctx.params.id, requestId);
    if (configError) return configError;
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "POST /api/barriers/:id/contingencies",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    const parsed = await readJsonBodyCapped(ctx.req, 10_000);
    if (!parsed.ok) {
      return badRequest(
        parsed.reason === "too-large"
          ? "Request body is too large"
          : "Invalid JSON body",
        requestId,
      );
    }
    try {
      const contingencyBarrierId = parsePositiveId(
        parsed.body.contingencyBarrierId,
        "contingencyBarrierId",
      );
      const managementChange = normalizeOptionalReference(
        parsed.body.managementChange,
        "managementChange",
      );
      const riskAnalysis = normalizeOptionalReference(
        parsed.body.riskAnalysis,
        "riskAnalysis",
      );
      if (!(await getBarrierById(barrierId))) {
        return notFound("Barrier not found", requestId);
      }
      const result = await addBarrierContingency(
        barrierId,
        contingencyBarrierId,
        managementChange,
        riskAnalysis,
      );
      if (result === "duplicate") {
        return badRequest("This contingency is already linked", requestId);
      }
      if (result === "ineligible") {
        return badRequest(
          "The selected barrier is not an eligible contingency",
          requestId,
        );
      }
      return ok({ created: true }, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("must be") || message.includes("too long") ||
        message.includes("is required")
      ) {
        return badRequest(message, requestId);
      }
      return internal(
        `POST /api/barriers/${barrierId}/contingencies`,
        err,
        requestId,
        "Failed to add contingency",
      );
    }
  },

  async PATCH(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const configError = loadConfig("PATCH", ctx.params.id, requestId);
    if (configError) return configError;
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "PATCH /api/barriers/:id/contingencies",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const barrierId = parseIdParam(ctx.params.id);
    if (barrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    const parsed = await readJsonBodyCapped(ctx.req, 10_000);
    if (!parsed.ok) {
      return badRequest(
        parsed.reason === "too-large"
          ? "Request body is too large"
          : "Invalid JSON body",
        requestId,
      );
    }
    try {
      const contingencyBarrierId = parsePositiveId(
        parsed.body.contingencyBarrierId,
        "contingencyBarrierId",
      );
      const managementChange = normalizeOptionalReference(
        parsed.body.managementChange,
        "managementChange",
      );
      const riskAnalysis = normalizeOptionalReference(
        parsed.body.riskAnalysis,
        "riskAnalysis",
      );
      const updated = await updateBarrierContingency(
        barrierId,
        contingencyBarrierId,
        managementChange,
        riskAnalysis,
      );
      if (!updated) return notFound("Contingency link not found", requestId);
      return ok({ updated: true }, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("must be") || message.includes("too long")) {
        return badRequest(message, requestId);
      }
      return internal(
        `PATCH /api/barriers/${barrierId}/contingencies`,
        err,
        requestId,
        "Failed to update contingency",
      );
    }
  },

  async DELETE(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    const configError = loadConfig("DELETE", ctx.params.id, requestId);
    if (configError) return configError;
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable(
        "DELETE /api/barriers/:id/contingencies",
        err,
        requestId,
      );
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const barrierId = parseIdParam(ctx.params.id);
    const contingencyBarrierId = parseIdParam(
      ctx.url.searchParams.get("contingencyBarrierId") ?? undefined,
    );
    if (barrierId === undefined || contingencyBarrierId === undefined) {
      return badRequest("Invalid barrier id", requestId);
    }
    try {
      const removed = await removeBarrierContingency(
        barrierId,
        contingencyBarrierId,
      );
      if (!removed) return notFound("Contingency link not found", requestId);
      return ok({ removed: true }, requestId);
    } catch (err) {
      return internal(
        `DELETE /api/barriers/${barrierId}/contingencies`,
        err,
        requestId,
        "Failed to remove contingency",
      );
    }
  },
});
