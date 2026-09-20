// API: /api/recipients - alert digest audience, admin-only.
// This is why it exists: the send path reads recipients from the database;
// only admins may list or change them (session or ADMIN_TOKEN on every
// method, including GET - recipient addresses are admin data).
import {
  readThrottle,
  routeClientKey,
  type Throttle,
  writeThrottle,
} from "../../lib/server/throttle.ts";

import {
  badRequest,
  internal,
  newRequestId,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  createRecipient,
  listRecipients,
} from "../../lib/server/sql/recipients.ts";

import { denyByCredentials, requireAdminAuth } from "../../lib/server/auth.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { define } from "../../utils.ts";

async function guard(
  ctx: unknown,
  req: Request,
  bucket: Throttle,
  requestId: string,
): Promise<Response | null> {
  const limit = bucket.check(routeClientKey(ctx));
  if (!limit.allowed) {
    return rateLimited("too many requests", requestId, limit.retryAfterMs);
  }
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return denyByCredentials(req, auth.message, requestId);
  try {
    loadServerConfig();
  } catch (err) {
    return internal("recipients", err, requestId, "Server misconfigured");
  }
  return null;
}

export const handler = define.handlers({
  // GET the recipient list (activeOnly=1 filters).
  async GET(ctx) {
    const requestId = newRequestId();
    const denied = await guard(ctx, ctx.req, readThrottle, requestId);
    if (denied) return denied;
    try {
      const activeOnly = ctx.url.searchParams.get("activeOnly") === "1";
      return Response.json(await listRecipients(activeOnly));
    } catch (err) {
      return internal(
        "GET /api/recipients",
        err,
        requestId,
        "Failed to fetch recipients",
      );
    }
  },

  // POST { email, name? } - creates or revives (upsert on email).
  async POST(ctx) {
    const requestId = newRequestId();
    const denied = await guard(ctx, ctx.req, writeThrottle, requestId);
    if (denied) return denied;
    let body: { email?: unknown; name?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const created = await createRecipient(
        body.email as string,
        (body.name as string | undefined) ?? "",
      );
      return Response.json(created, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("invalid email") || message.includes("name")) {
        return badRequest(message, requestId);
      }
      return internal(
        "POST /api/recipients",
        err,
        requestId,
        "Failed to create recipient",
      );
    }
  },
});
