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
  created,
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  createRecipient,
  listRecipients,
} from "../../lib/server/sql/recipients.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../lib/server/auth.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import { readJsonBody } from "../../lib/server/validation.ts";

import { define } from "../../utils.ts";

async function guard(
  ctx: unknown,
  req: Request,
  bucket: Throttle,
  requestId: string,
  logLabel: string,
): Promise<Response | null> {
  const limit = bucket.check(routeClientKey(ctx));
  if (!limit.allowed) {
    return rateLimited("too many requests", requestId, limit.retryAfterMs);
  }
  try {
    loadServerConfig();
  } catch (err) {
    return internal(logLabel, err, requestId, "Server misconfigured");
  }
  let auth;
  try {
    auth = await requireAdminAuth(req);
  } catch (err) {
    return authStoreUnavailable(logLabel, err, requestId);
  }
  if (!auth.ok) return denyByCredentials(req, auth.message, requestId);
  return null;
}

export const handler = define.handlers({
  // GET the recipient list (activeOnly=1 filters).
  async GET(ctx) {
    const requestId = newRequestId();
    const denied = await guard(
      ctx,
      ctx.req,
      readThrottle,
      requestId,
      "GET /api/recipients",
    );
    if (denied) return denied;
    try {
      const activeOnly = ctx.url.searchParams.get("activeOnly") === "1";
      return ok(await listRecipients(activeOnly), requestId);
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
    const denied = await guard(
      ctx,
      ctx.req,
      writeThrottle,
      requestId,
      "POST /api/recipients",
    );
    if (denied) return denied;
    const parsed = await readJsonBody(ctx.req);
    if (!parsed.ok) return badRequest("Invalid JSON body", requestId);
    const body = parsed.body as { email?: unknown; name?: unknown };
    try {
      const createdRecipient = await createRecipient(
        body.email as string,
        (body.name as string | undefined) ?? "",
      );
      return created(createdRecipient, requestId);
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
