// API: GET /api/export?format=csv - server CSV of the current query.
// This is why it exists: the dashboard's CSV download only covers the loaded
// page; this endpoint streams the whole filtered set (capped) with byte-same
// rows via lib/server/exportCsv.ts. Open like the other dashboard GETs
// (decision documented in docs/API.md); throttled tighter (DB-heavy).
import { parseDateParam, parseIntParam, parseQueryParam } from "./_params.ts";
import { listBarriers } from "../../lib/server/sql/barriers.ts";
import { resolveBarriers } from "../../lib/resolve.ts";
import { loadServerConfig } from "../../lib/server/config.ts";
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
import { exportThrottle, routeClientKey } from "../../lib/server/throttle.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
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
      locationId: parseIntParam(sp.get("locationId")),
      disponibilidadeId: parseIntParam(sp.get("disponibilidadeId")),
      conformidadeId: parseIntParam(sp.get("conformidadeId")),
      categoriaId: parseIntParam(sp.get("categoriaId")),
      query: parseQueryParam(sp.get("query")),
      since: parseDateParam(sp.get("since")),
      until: parseDateParam(sp.get("until")),
      page: 1,
      pageSize: EXPORT_MAX_ROWS,
      sortCol: sp.get("sortCol") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
    };

    try {
      const data = await listBarriers(query);
      if (data.total > EXPORT_MAX_ROWS) {
        return badRequest(
          `export would return ${data.total} rows, over the ${EXPORT_MAX_ROWS}-row cap - refine the filters`,
          requestId,
        );
      }
      const barriers = resolveBarriers(data.items);
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
