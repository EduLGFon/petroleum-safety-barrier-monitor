import { NextRequest, NextResponse } from "next/server";
import { getBarrierById } from "@/lib/server/sql/barriers";

/**
 * GET /api/barriers/:id -> WireBarrier | 404
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const barrierId = Number(id);

  if (!Number.isInteger(barrierId) || barrierId <= 0) {
    return NextResponse.json({ error: "Invalid barrier id" }, { status: 400 });
  }

  try {
    const barrier = await getBarrierById(barrierId);
    if (!barrier) {
      return NextResponse.json({ error: "Barrier not found" }, { status: 404 });
    }
    return NextResponse.json(barrier);
  } catch (err) {
    console.error(`[GET /api/barriers/${id}]`, err);
    return NextResponse.json({ error: "Failed to fetch barrier" }, {
      status: 500,
    });
  }
}
