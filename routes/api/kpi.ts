// API: GET /api/kpi - KPI snapshot over the current filters.
// This is why it exists: Fresh port of the Next route; the snapshot honors
// the same filter subset as the table (location, availability, compliance,
// category, criticality, action-plan presence, text, dates) so the header
// never disagrees with the grid.
// Authenticated GET (session or ADMIN_TOKEN); anonymous gets 404.
import { forbidden, internal, okWithEtag } from "../../lib/server/errors.ts";

import { getKpi } from "../../lib/server/sql/barriers.ts";

import { parseFilterQuery } from "./_params.ts";

import { guardRequest } from "../../lib/server/api-guard.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET KPI snapshot for the given filters (all omitted = everything).
  async GET(ctx) {
    const g = await guardRequest(ctx, {
      kind: "read",
      auth: "data",
      label: "GET /api/kpi",
    });
    if (g.response) return g.response;
    const requestId = g.requestId;
    const dataAuth = g.dataAuth as {
      ok: true;
      role: string;
      user?: { allowedLocationIds?: number[] };
    };
    const filter = {
      ...parseFilterQuery(ctx.url.searchParams),
      allowedLocationIds: dataAuth.role === "admin"
        ? null
        : (dataAuth.user?.allowedLocationIds ?? []),
    };
    if (
      (filter.rowScope === "deleted" || filter.rowScope === "all") &&
      dataAuth.role !== "admin"
    ) {
      return forbidden("admin only", requestId);
    }

    try {
      const snapshot = await getKpi(filter, {
        scopeCounts: dataAuth.role === "admin",
      });
      return okWithEtag(ctx.req, snapshot, requestId);
    } catch (err) {
      return internal(
        "GET /api/kpi",
        err,
        requestId,
        "Failed to fetch KPI snapshot",
      );
    }
  },
});
