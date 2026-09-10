// API: GET /api/kpi - KPI snapshot scoped by location.
// This is why it exists: Fresh port of the Next route; omitted or 0
// locationId means all installations (matches ALL=0 in lib/enums.ts).
import { getKpi } from "../../lib/server/sql/barriers.ts";
import { parseIntParam } from "./_params.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET KPI snapshot for locationId (undefined/0 = all installations).
  async GET(ctx) {
    const locationId = parseIntParam(ctx.url.searchParams.get("locationId"));

    try {
      const snapshot = await getKpi(locationId);
      return Response.json(snapshot);
    } catch (err) {
      console.error("[GET /api/kpi]", err);
      return Response.json({ error: "Failed to fetch KPI snapshot" }, {
        status: 500,
      });
    }
  },
});
