// API: GET /api/vocabularies - filter vocabularies for refresh cadence.
// This is why it exists: the dashboard SSRs vocabularies once, but the
// auto-refresh tick refetches them so new stations/categories appear
// without a full page reload. Authenticated GET (labels leak stations).
// auth helpers now centralized in api-guard.ts

import { internal, okWithEtag } from "../../lib/server/errors.ts";

import { getVocabularies } from "../../lib/server/sql/vocabularies.ts";

import { guardRequest } from "../../lib/server/api-guard.ts";

import { define } from "../../utils.ts";

export const handler = define.handlers({
  // GET the current filter vocabularies (id-bearing locations/categories).
  async GET(ctx) {
    const g = await guardRequest(ctx, {
      kind: "read",
      auth: "data",
      label: "GET /api/vocabularies",
    });
    if (g.response) return g.response;
    const requestId = g.requestId;
    const dataAuth = g.dataAuth as {
      ok: true;
      role: string;
      user?: { allowedLocationIds?: number[] };
    };
    try {
      const allowed = dataAuth.role === "admin"
        ? null
        : (dataAuth.user?.allowedLocationIds ?? []);
      return okWithEtag(ctx.req, await getVocabularies(allowed), requestId);
    } catch (err) {
      return internal(
        "GET /api/vocabularies",
        err,
        requestId,
        "Failed to fetch vocabularies",
      );
    }
  },
});
