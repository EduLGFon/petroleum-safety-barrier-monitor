// API: PATCH /api/barriers/:id/status - status transition write path.
// This is why it exists: the one sanctioned way to change disponibilidade,
// via record_status_change() (see db/schema.sql). Bonus endpoint reserved
// for the admin role modeled in settings.
import { transitionBarrierStatus } from "../../../../lib/server/sql/barriers.ts";
import { define } from "../../../../utils.ts";

interface StatusBody {
  statusId?: number;
  authorId?: number;
  note?: string;
}

export const handler = define.handlers({
  // PATCH barrier status via transitionBarrierStatus; validates id and body.
  async PATCH(ctx) {
    const barrierId = Number(ctx.params.id);

    if (!Number.isInteger(barrierId) || barrierId <= 0) {
      return Response.json({ error: "Invalid barrier id" }, { status: 400 });
    }

    let body: StatusBody;
    try {
      body = await ctx.req.json() as StatusBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { statusId, authorId, note } = body;
    if (
      !Number.isInteger(statusId) || (statusId as number) < 0 ||
      !Number.isInteger(authorId) || (authorId as number) < 0
    ) {
      return Response.json(
        { error: "statusId and authorId are required non-negative integers" },
        { status: 400 },
      );
    }
    if (note !== undefined && typeof note !== "string") {
      return Response.json({ error: "note must be a string" }, {
        status: 400,
      });
    }

    try {
      const updated = await transitionBarrierStatus(
        barrierId,
        statusId as number,
        authorId as number,
        (note ?? "").slice(0, 2000),
      );
      if (!updated) {
        return Response.json({ error: "Barrier not found" }, { status: 404 });
      }
      return Response.json(updated);
    } catch (err) {
      console.error(`[PATCH /api/barriers/${ctx.params.id}/status]`, err);
      return Response.json({ error: "Failed to update barrier status" }, {
        status: 500,
      });
    }
  },
});
