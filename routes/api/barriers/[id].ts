// API: GET /api/barriers/:id - single wire barrier or 404.
// This is why it exists: Fresh port of the Next route with identical
// id validation and error shapes.
import { getBarrierById } from "../../../lib/server/sql/barriers.ts";
import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const barrierId = Number(ctx.params.id);

    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return Response.json({ error: "Invalid barrier id" }, { status: 400 });
    }

    try {
      const barrier = await getBarrierById(barrierId);
      if (!barrier) {
        return Response.json({ error: "Barrier not found" }, { status: 404 });
      }
      return Response.json(barrier);
    } catch (err) {
      console.error(`[GET /api/barriers/${ctx.params.id}]`, err);
      return Response.json({ error: "Failed to fetch barrier" }, {
        status: 500,
      });
    }
  },
});
