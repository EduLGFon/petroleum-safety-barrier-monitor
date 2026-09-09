// API: GET /api/health - liveness probe for the dashboard API.
// This is why it exists: load balancers and the future sync worker need a
// DB-independent endpoint that answers even when Postgres is down.
import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET health status with server time; never touches the database.
  GET() {
    return Response.json({ ok: true, time: new Date().toISOString() });
  },
});
