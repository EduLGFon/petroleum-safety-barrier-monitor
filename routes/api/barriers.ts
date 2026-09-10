// API: GET /api/barriers - paged wire barrier list.
// This is why it exists: Fresh port of the Next route with the same
// BarriersQuery contract (see lib/wireTypes.ts) for the http adapter.
import { parseDateParam, parseIntParam, parseQueryParam } from "./_params.ts";
import { listBarriers } from "../../lib/server/sql/barriers.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET paged barriers matching BarriersQuery filters; 500 on DB failure.
  async GET(ctx) {
    const sp = ctx.url.searchParams;
    const query: BarriersQuery = {
      locationId: parseIntParam(sp.get("locationId")),
      disponibilidadeId: parseIntParam(sp.get("disponibilidadeId")),
      conformidadeId: parseIntParam(sp.get("conformidadeId")),
      categoriaId: parseIntParam(sp.get("categoriaId")),
      query: parseQueryParam(sp.get("query")),
      since: parseDateParam(sp.get("since")),
      until: parseDateParam(sp.get("until")),
      page: parseIntParam(sp.get("page")),
      pageSize: parseIntParam(sp.get("pageSize")),
      sortCol: sp.get("sortCol") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
    };

    try {
      const data = await listBarriers(query);
      return Response.json(data);
    } catch (err) {
      console.error("[GET /api/barriers]", err);
      return Response.json({ error: "Failed to fetch barriers" }, {
        status: 500,
      });
    }
  },
});
