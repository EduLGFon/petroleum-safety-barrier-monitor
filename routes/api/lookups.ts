// API: GET /api/lookups - id-bearing option lists for admin UI.
// This is why it exists: status assignment and alert-rule forms need numeric
// ids (not display labels) for availabilities, categories, and authors. The
// public vocabularies endpoint only carries labels, so this authenticated
// endpoint serves the exact rows those writes reference.
import {
  authStoreUnavailable,
  denyByCredentials,
  requireAuthenticated,
} from "../../lib/server/auth.ts";

import {
  internal,
  newRequestId,
  okWithEtag,
  rateLimited,
} from "../../lib/server/errors.ts";

import { listAuthors } from "../../lib/server/sql/authors.ts";

import { guardRequest } from "../../lib/server/api-guard.ts";

import { queryRows } from "../../lib/server/db.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET - returns availabilities, categories, and authors with ids.
  async GET(ctx) {
    const g = await guardRequest(ctx, {
      kind: "read",
      auth: "user",
      label: "GET /api/lookups",
    });
    if (g.response) return g.response;
    const requestId = g.requestId;
    try {
      const [
        availabilities,
        categories,
        locations,
        criticalities,
        typologies,
        groupings,
        owners,
        authors,
      ] = await Promise.all([
        queryRows<{ id: number; label: string }>(
          `select id, label from availability_statuses order by id`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from categories order by label`,
        ),
        queryRows<{ id: number; code: string; name: string | null }>(
          `select id, code, name from locations order by code`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from criticality_levels order by id`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from typologies order by label`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from groupings order by label`,
        ),
        queryRows<{ id: number; label: string }>(
          `select id, label from owners order by label`,
        ),
        listAuthors(),
      ]);
      return okWithEtag(ctx.req, {
        availabilities,
        categories,
        locations,
        criticalities,
        typologies,
        groupings,
        owners,
        authors,
      }, requestId);
    } catch (err) {
      return internal(
        "GET /api/lookups",
        err,
        requestId,
        "Failed to fetch lookups",
      );
    }
  },
});
