// API: GET /api/export?format=csv - server CSV of the current query.
// This is why it exists: the dashboard's CSV download streams the whole
// filtered set (capped) with byte-same rows via lib/server/exportCsv.ts,
// resolving real station/category labels from the lookup tables. Open like
// the other dashboard GETs (decision documented in docs/API.md); throttled
// tighter (DB-heavy).
import {
  badRequest,
  internal,
  newRequestId,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  EXPORT_MAX_ROWS,
  streamExportCsv,
} from "../../lib/server/exportCsv.ts";

import { parseFilterQuery } from "./_params.ts";

import { exportThrottle, routeClientKey } from "../../lib/server/throttle.ts";

import { listBarriers } from "../../lib/server/sql/barriers.ts";

import { getResolverLabels } from "../../lib/server/sql/vocabularies.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import type { BarriersQuery } from "../../lib/wireTypes.ts";

import { resolveBarriers } from "../../lib/resolve.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET the filtered set as CSV (BOM, header, rows, RESUMO); 400 on
  // non-csv format or over-cap totals, 429 when the export bucket is spent.
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = exportThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited(
        "export rate limit exceeded",
        requestId,
        limit.retryAfterMs,
      );
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/export",
        err,
        requestId,
        "Server misconfigured",
      );
    }

    const sp = ctx.url.searchParams;
    if ((sp.get("format") ?? "csv") !== "csv") {
      return badRequest("format must be csv", requestId);
    }
    const query: BarriersQuery = {
      ...parseFilterQuery(sp),
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      sortCol: sp.get("sortCol") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
    };

    try {
      const [data, labels] = await Promise.all([
        listBarriers(query),
        getResolverLabels(),
      ]);
      if (data.total > EXPORT_MAX_ROWS) {
        return badRequest(
          `export would return ${data.total} rows, over the ${EXPORT_MAX_ROWS}-row cap - refine the filters`,
          requestId,
        );
      }
      const barriers = resolveBarriers(data.items, labels);
      return new Response(streamExportCsv(barriers), {
        status: 200,
        headers: {
          "content-type": "text/csv;charset=utf-8",
          "content-disposition": 'attachment; filename="barreiras.csv"',
          "x-request-id": requestId,
          "x-export-total": String(data.total),
        },
      });
    } catch (err) {
      return internal(
        "GET /api/export",
        err,
        requestId,
        "Failed to build CSV export",
      );
    }
  },
});
