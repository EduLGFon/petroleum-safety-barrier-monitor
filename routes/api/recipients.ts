// API: /api/recipients - legacy manual recipient list, admin-only, not read
// by alert delivery.
// This route is legacy manual CRUD retained for operators; alert delivery
// derives its audience from active users and access groups and no longer
// reads this table. Only admins may list or change it (session or
// ADMIN_TOKEN on every method, including GET - recipient addresses are
// admin data).
import {
  badRequest,
  created,
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import {
  readThrottle,
  routeClientKey,
  type Throttle,
  writeThrottle,
} from "../../lib/server/throttle.ts";

import {
  authStoreUnavailable,
  denyByCredentials,
  requireAdminAuth,
} from "../../lib/server/auth.ts";

import {
  createRecipient,
  listRecipients,
} from "../../lib/server/sql/recipients.ts";

import { loadServerConfig } from "../../lib/server/config.ts";

import {
  POSTGRES_UNIQUE_VIOLATION,
  postgresErrorInfo,
  readJsonBody,
  ValidationError,
} from "../../lib/server/validation.ts";

import { define } from "../../utils.ts";

import { denyIfCrossSite } from "../../lib/server/csrf.ts";

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

// duplicateMessage: a unique violation reported by the driver, mapped to a
// controlled message. The SQLSTATE and the constraint name decide - never the
// error text.
function duplicateMessage(err: unknown): string | undefined {
  const info = postgresErrorInfo(err);
  if (info.code !== POSTGRES_UNIQUE_VIOLATION) return undefined;
  return info.constraint === "alert_recipients_email_key"
    ? "email already exists"
    : "duplicate value";
}

export const handler = define.handlers({
  // GET the recipient list (activeOnly=1 filters).
  async GET(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
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
      return okWithEtag(ctx.req, await listRecipients(activeOnly), requestId);
    } catch (err) {
      return internal(
        "GET /api/recipients",
        err,
        requestId,
        "Failed to fetch recipients",
      );
    }
  },

  // POST { email, name?, phone? } - creates a recipient; a duplicate email
  // updates name/phone and leaves active unchanged.
  async POST(ctx) {
    const requestId = newRequestId();
    const csrf = denyIfCrossSite(ctx.req, requestId);
    if (csrf) return csrf;
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
    const body = parsed.body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
    };
    try {
      const createdRecipient = await createRecipient(
        body.email as string,
        (body.name as string | undefined) ?? "",
        body.phone ?? "",
      );
      return created(createdRecipient, requestId);
    } catch (err) {
      if (err instanceof ValidationError) {
        return badRequest(err.message, requestId);
      }
      const duplicate = duplicateMessage(err);
      if (duplicate !== undefined) {
        return badRequest(duplicate, requestId);
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
