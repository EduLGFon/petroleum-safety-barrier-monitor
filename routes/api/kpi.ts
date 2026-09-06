// API: GET /api/kpi - KPI snapshot scoped by location.
// This is why it exists: Fresh port of the Next route; omitted or 0
// locationId means all installations (matches ALL=0 in lib/enums.ts).
import { getKpi } from "../../lib/server/sql/barriers.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const raw = ctx.url.searchParams.get("locationId");
    const locationId = raw === null || raw === "" ? undefined : Number(raw);

    try {
      const snapshot = await getKpi(
        Number.isFinite(locationId) ? locationId : undefined,
      );
      return Response.json(snapshot);
    } catch (err) {
      console.error("[GET /api/kpi]", err);
      return Response.json({ error: "Failed to fetch KPI snapshot" }, {
        status: 500,
      });
    }
  },
});
