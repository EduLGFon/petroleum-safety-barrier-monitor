// API: GET /api/barriers - paged wire barrier list.
// This is why it exists: Fresh port of the Next route with the same
// BarriersQuery contract (see lib/wireTypes.ts) for the http adapter.
import { listBarriers } from "../../lib/server/sql/barriers.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import { define } from "../../utils.ts";

// Parses optional integer query param; undefined for missing/invalid.
// Rejects floats, negatives are left to listBarriers clamping per field.
function parseIntParam(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  if (!/^-?\d+$/.test(v.trim())) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

// Parses optional ISO-date param (YYYY-MM-DD); undefined when malformed.
function parseDateParam(v: string | null): string | undefined {
  if (v === null || v === "") return undefined;
  const date = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

// Trims free text and caps length so a pasted blob cannot become a huge LIKE.
function parseQueryParam(v: string | null): string | undefined {
  if (v === null) return undefined;
  const trimmed = v.trim().slice(0, 200);
  return trimmed === "" ? undefined : trimmed;
}

export const handler = define.handlers({
  // GET paged barriers matching BarriersQuery filters; 500 on DB failure.
  async GET(ctx) {
    const sp = ctx.url.searchParams;
    const query: BarriersQuery = {
      locationId: parseIntParam(sp.get("locationId")),
      disponibilidadeId: parseIntParam(sp.get("disponibilidadeId")),
      conformidadeId: parseIntParam(sp.get("conformidadeId")),
      categoriaId: parseIntParam(sp.get("categoriaId")),
      query: parseQueryParam(sp.get("query")),
      since: parseDateParam(sp.get("since")),
      until: parseDateParam(sp.get("until")),
      page: parseIntParam(sp.get("page")),
      pageSize: parseIntParam(sp.get("pageSize")),
      sortCol: sp.get("sortCol") ?? undefined,
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
    };

    try {
      const data = await listBarriers(query);
      return Response.json(data);
    } catch (err) {
      console.error("[GET /api/barriers]", err);
      return Response.json({ error: "Failed to fetch barriers" }, {
        status: 500,
      });
    }
  },
});
