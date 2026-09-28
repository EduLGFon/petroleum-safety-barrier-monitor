// API: GET|POST /api/export - the whole selection as csv, xlsx or pdf.
// This is why it exists: the dashboard download must cover every selected
// barrier (18k and up), which no browser-side builder can hold. Filters
// arrive as query params on both verbs; the selection (ids) arrives in the
// request body, so an 18k-row selection never has to fit a URL. Rows are
// streamed from the database in batches (lib/server/export*). Authenticated
// like the other dashboard GETs (extraction needs a session or ADMIN_TOKEN);
// anonymous gets 404 camouflage. Throttled tighter.
import {
  badRequest,
  internal,
  newRequestId,
  notFound,
  rateLimited,
  unauthorized,
} from "../../lib/server/errors.ts";

import {
  exportBatches,
  resolveExportScope,
} from "../../lib/server/exportRows.ts";

import { EXPORT_MAX_ROWS, refusalMessage } from "../../lib/export/limits.ts";

import { exportThrottle, routeClientKey } from "../../lib/server/throttle.ts";
import { checkDbThrottle } from "../../lib/server/sql/throttle.ts";
import { streamExportCsv } from "../../lib/server/exportCsv.ts";
import { FMT_EXT, FMT_MIME, normalizeFmt } from "../../lib/export/format.ts";
import { resolveTimeZone } from "../../lib/export/html.ts";
import { loadServerConfig } from "../../lib/server/config.ts";
import { streamExportPdf } from "../../lib/server/exportPdf.ts";
import { streamExportXlsx } from "../../lib/server/exportXlsx.ts";
import { getCompanyName } from "../../lib/company.ts";
import type { ExportScope } from "../../lib/server/exportRows.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import { requireDataAuth } from "../../lib/server/auth.ts";
import { parseFilterQuery } from "./_params.ts";

import { define } from "../../utils.ts";

import type { Fmt } from "../../lib/export/format.ts";

// Request payload: the filters always come from the query string (one parser
// for GET and POST alike); the selection and the browser time zone come from
// the body, where an 18k-id list fits comfortably.
interface ExportRequest {
  format: Fmt;
  ids?: number[];
  timeZone?: string;
}

// parseIds: only positive safe integers, deduped and capped at the row
// ceiling. An empty or malformed list means the export covers the whole
// filtered scope, so a bad body can never widen or narrow it silently.
function parseIds(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = [
    ...new Set(
      raw.filter((n): n is number =>
        typeof n === "number" && Number.isSafeInteger(n) && n > 0
      ),
    ),
  ];
  if (ids.length === 0) return undefined;
  return ids.slice(0, EXPORT_MAX_ROWS);
}

// readBody: the optional JSON payload. A missing or non-JSON body is a valid
// request (full filtered scope), so GET works unchanged.
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    // No body (or not JSON) is a valid request: full scope, part 1.
    return {};
  }
}

export const handler = define.handlers({
  async GET(ctx) {
    return stream(ctx, await readBody(ctx.req), ctx.url.searchParams);
  },
  async POST(ctx) {
    return stream(ctx, await readBody(ctx.req), ctx.url.searchParams);
  },
});

// stream: shared auth/throttle/format gate, then the format-specific stream.
async function stream(
  ctx: { req: Request; url: URL },
  body: Record<string, unknown>,
  sp: URLSearchParams,
): Promise<Response> {
  const requestId = newRequestId();
  // Errors name the verb that actually arrived (GET or POST).
  const where = `${ctx.req.method} /api/export`;
  // Shared DB budget first so multi-isolate deploys enforce one limit;
  // falls back to the in-memory bucket when the DB is unreachable.
  const clientKey = routeClientKey(ctx);
  let limit = exportThrottle.check(clientKey);
  try {
    const shared = await checkDbThrottle("export", clientKey, 120, 60_000);
    limit = shared;
  } catch {
    // Keep the in-memory decision when the shared store is unavailable.
  }
  if (!limit.allowed) {
    return rateLimited(
      "export rate limit exceeded",
      requestId,
      limit.retryAfterMs,
    );
  }
  try {
    loadServerConfig();
  } catch (err) {
    return internal(where, err, requestId, "Server misconfigured");
  }
  const dataAuth = await requireDataAuth(ctx.req);
  if (!dataAuth.ok) {
    return dataAuth.anonymous
      ? notFound("not found", requestId)
      : unauthorized(dataAuth.message, requestId);
  }

  // A tab opened before a format migration still asks for its old key; it
  // resolves to the current format instead of failing the request.
  const requested = normalizeFmt(body.format ?? sp.get("format") ?? "csv");
  if (!requested) {
    return badRequest("format must be csv, xlsx or pdf", requestId);
  }
  const req: ExportRequest = {
    format: requested,
    ids: parseIds(body.ids),
    timeZone: resolveTimeZone(body.timeZone),
  };
  const query: BarriersQuery = {
    ...parseFilterQuery(sp),
    ids: req.ids,
    page: 1,
    sortCol: sp.get("sortCol") ?? undefined,
    sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
  };
  if (
    (query.rowScope === "deleted" || query.rowScope === "all") &&
    dataAuth.role !== "admin"
  ) {
    return unauthorized("admin only", requestId);
  }

  try {
    const scope = await resolveExportScope(query);
    // Past the ceiling the file stops being a download: say so with the real
    // count instead of silently cutting rows.
    if (scope.kpi.total > EXPORT_MAX_ROWS) {
      return badRequest(
        refusalMessage("Exportação", scope.kpi.total),
        requestId,
      );
    }
    return respond(req, scope, getCompanyName(), requestId);
  } catch (err) {
    return internal(where, err, requestId, "Failed to build export");
  }
}

// respond: wires the format stream and its download headers. Every format
// downloads as one file, streamed straight from the database batches.
function respond(
  req: ExportRequest,
  scope: ExportScope,
  companyName: string,
  requestId: string,
): Response {
  const total = scope.kpi.total;
  const headers: Record<string, string> = {
    "x-request-id": requestId,
    "x-export-total": String(total),
  };
  if (req.format === "xlsx") {
    return new Response(
      streamExportXlsx(exportBatches(scope), {
        companyName,
        kpi: scope.kpi,
        timeZone: req.timeZone,
      }),
      { status: 200, headers: fileHeaders(headers, "xlsx") },
    );
  }
  if (req.format === "pdf") {
    return new Response(
      streamExportPdf(exportBatches(scope), {
        companyName,
        kpi: scope.kpi,
        title: "barreiras",
        timeZone: req.timeZone,
      }),
      { status: 200, headers: fileHeaders(headers, "pdf") },
    );
  }
  return new Response(streamExportCsv(exportBatches(scope), scope.kpi), {
    status: 200,
    headers: fileHeaders(headers, "csv"),
  });
}

// fileHeaders: content type plus the download disposition for a file format.
function fileHeaders(
  base: Record<string, string>,
  format: "csv" | "xlsx" | "pdf",
): Record<string, string> {
  return {
    ...base,
    "content-type": FMT_MIME[format],
    "content-disposition": `attachment; filename="barreiras${FMT_EXT[format]}"`,
  };
}
