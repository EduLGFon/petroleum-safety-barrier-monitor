// API: /api/field-options - curated answers for sheet questions.
// This is why it exists: admins settle default options in Settings and the
// barrier editor offers them; readers get seeded workbook values on a fresh
// database without any admin action.
import {
  listFieldOptionSets,
  upsertFieldOptionSet,
} from "../../lib/server/sql/field-options.ts";
import {
  authStoreUnavailable,
  denyByCredentials,
  denyDataAuth,
  requireAdminAuth,
  requireDataAuth,
} from "../../lib/server/auth.ts";
import {
  badRequest,
  internal,
  newRequestId,
  ok,
  rateLimited,
} from "../../lib/server/errors.ts";
import {
  readThrottle,
  routeClientKey,
  writeThrottle,
} from "../../lib/server/throttle.ts";
import { isFieldKey, normalizeOptions } from "../../lib/field-options.ts";
import { loadServerConfig } from "../../lib/server/config.ts";
import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET - lists every field's option set (any authenticated reader).
  async GET(ctx) {
    const requestId = newRequestId();
    const limit = readThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "GET /api/field-options",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireDataAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("GET /api/field-options", err, requestId);
    }
    if (!auth.ok) return denyDataAuth(auth, requestId);
    try {
      return ok(await listFieldOptionSets(), requestId);
    } catch (err) {
      return internal(
        "GET /api/field-options",
        err,
        requestId,
        "Failed to fetch option sets",
      );
    }
  },

  // PUT - replaces one field's list (?field=key); admin only.
  async PUT(ctx) {
    const requestId = newRequestId();
    const limit = writeThrottle.check(routeClientKey(ctx));
    if (!limit.allowed) {
      return rateLimited("too many requests", requestId, limit.retryAfterMs);
    }
    try {
      loadServerConfig();
    } catch (err) {
      return internal(
        "PUT /api/field-options",
        err,
        requestId,
        "Server misconfigured",
      );
    }
    let auth;
    try {
      auth = await requireAdminAuth(ctx.req);
    } catch (err) {
      return authStoreUnavailable("PUT /api/field-options", err, requestId);
    }
    if (!auth.ok) return denyByCredentials(ctx.req, auth.message, requestId);
    const field = ctx.url.searchParams.get("field");
    if (!isFieldKey(field)) {
      return badRequest("Unknown field", requestId);
    }
    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return badRequest("Invalid JSON body", requestId);
    }
    try {
      const options = normalizeOptions(body.options);
      const saved = await upsertFieldOptionSet(field, options, "admin");
      return ok(saved, requestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("options")) return badRequest(message, requestId);
      return internal(
        "PUT /api/field-options",
        err,
        requestId,
        "Failed to save option set",
      );
    }
  },
});
