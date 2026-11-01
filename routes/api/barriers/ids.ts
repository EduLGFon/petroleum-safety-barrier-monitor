// API: GET /api/barriers/ids - id-only listing over the filter scope.
// This is why it exists: "select all that match" needs ids, not full rows.
// Paging 18k full wire barriers (each with 30 columns) through the browser
// just to map them to ids wastes megabytes and main-thread time; this
// endpoint answers the same scope with one int per row, no laterals.
import { forbidden, internal, okWithEtag } from "../../../lib/server/errors.ts";

import {
  type DataAuth,
  resolveAllowedLocationIds,
} from "../../../lib/server/auth.ts";

import { listBarrierIds } from "../../../lib/server/sql/barriers.ts";

import { hasDateParamError, parseFilterQuery } from "../_params.ts";

import { guardRequest } from "../../../lib/server/api-guard.ts";

import type { BarriersQuery } from "../../../lib/wireTypes.ts";

import { define } from "../../../utils.ts";

export const handler = define.handlers({
  // GET the ids matching the filter scope (same subset as the table).
  async GET(ctx) {
    const g = await guardRequest(ctx, {
      kind: "read",
      auth: "data",
      label: "GET /api/barriers/ids",
    });
    if (g.response) return g.response;
    const requestId = g.requestId;
    const dataAuth = g.dataAuth as Extract<DataAuth, { ok: true }>;
    if (hasDateParamError(ctx.url.searchParams)) {
      const { badRequest } = await import("../../../lib/server/errors.ts");
      return badRequest("Invalid date param", requestId);
    }
    const filter: BarriersQuery = {
      ...parseFilterQuery(ctx.url.searchParams),
      sortCol: ctx.url.searchParams.get("sortCol") ?? undefined,
      sortDir: ctx.url.searchParams.get("sortDir") === "desc" ? "desc" : "asc",
      allowedLocationIds: resolveAllowedLocationIds(dataAuth),
    };
    if (
      (filter.rowScope === "deleted" || filter.rowScope === "all") &&
      dataAuth.role !== "admin"
    ) {
      return forbidden("admin only", requestId);
    }
    try {
      const ids = await listBarrierIds(filter);
      return await okWithEtag(ctx.req, { ids, total: ids.length }, requestId);
    } catch (err) {
      return internal(
        "GET /api/barriers/ids",
        err,
        requestId,
        "Failed to fetch barrier ids",
      );
    }
  },
});
