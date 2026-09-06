import { NextRequest, NextResponse } from "next/server";
import { listBarriers } from "@/lib/server/sql/barriers";
import type { BarriersQuery } from "@/lib/wireTypes";

/**
 * GET /api/barriers?locationId=&disponibilidadeId=&conformidadeId=&categoriaId=
 *                   &query=&page=&pageSize=&sortCol=&sortDir=
 *
 * Matches the BarriersQuery/BarriersResponse contract in lib/wireTypes.ts
 * exactly — this is what lib/api.ts's httpAdapter calls when
 * NEXT_PUBLIC_API_MODE=http.
 */

function parseIntParam(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const query: BarriersQuery = {
    locationId: parseIntParam(sp.get("locationId")),
    disponibilidadeId: parseIntParam(sp.get("disponibilidadeId")),
    conformidadeId: parseIntParam(sp.get("conformidadeId")),
    categoriaId: parseIntParam(sp.get("categoriaId")),
    query: sp.get("query") ?? undefined,
    page: parseIntParam(sp.get("page")),
    pageSize: parseIntParam(sp.get("pageSize")),
    sortCol: sp.get("sortCol") ?? undefined,
    sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
  };

  try {
    const data = await listBarriers(query);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/barriers]", err);
    return NextResponse.json({ error: "Failed to fetch barriers" }, {
      status: 500,
    });
  }
}
