// API: GET /api/chart - per-category Conforme totals scoped by location.
// This is why it exists: Fresh port for the server-paginated dashboard; omitted
// or 0 locationId means all installations (matches ALL=0 in lib/enums.ts).
import { getChartData } from "../../lib/server/sql/chart.ts";
import { parseIntParam } from "./_params.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET chart rows for locationId (undefined/0 = all installations).
  async GET(ctx) {
    const raw = ctx.url.searchParams.get("locationId");
    const locationId = parseIntParam(raw);

    try {
      const rows = await getChartData(locationId);
      return Response.json(rows);
    } catch (err) {
      console.error("[GET /api/chart]", err);
      return Response.json({ error: "Failed to fetch chart data" }, {
        status: 500,
      });
    }
  },
});
