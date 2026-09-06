import { NextRequest, NextResponse } from "next/server";
import { getKpi } from "@/lib/server/sql/barriers";

/**
 * GET /api/kpi?locationId=<n> -> WireKpiSnapshot
 *
 * locationId omitted or 0 means "all installations" (matches the ALL=0
 * sentinel in lib/enums.ts's LOCATION_CODES).
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("locationId");
  const locationId = raw === null || raw === "" ? undefined : Number(raw);

  try {
    const snapshot = await getKpi(
      Number.isFinite(locationId) ? locationId : undefined,
    );
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[GET /api/kpi]", err);
    return NextResponse.json({ error: "Failed to fetch KPI snapshot" }, {
      status: 500,
    });
  }
}
