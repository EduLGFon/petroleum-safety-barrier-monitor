// API: GET /api/ready - readiness probe for orchestrators.
// This is why it exists: /api/health is a DB-free liveness probe, so a
// container with a broken DATABASE_URL used to report healthy while every
// data route returned 500. Readiness checks the boot config and a short
// database round-trip; failures answer 503 with Retry-After.
import { newRequestId, ok, unavailable } from "../../lib/server/errors.ts";

import { queryRows } from "../../lib/server/db.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET() {
    const requestId = newRequestId();
    let mode;
    try {
      mode = loadServerConfig().mode;
    } catch {
      return unavailable("Server misconfigured", requestId);
    }
    if (mode === "mock") {
      return ok({ ok: true, mode, time: new Date().toISOString() }, requestId);
    }
    try {
      await queryRows("select 1 as ready", []);
      return ok({ ok: true, mode, time: new Date().toISOString() }, requestId);
    } catch {
      return unavailable("Database unreachable", requestId);
    }
  },
});
