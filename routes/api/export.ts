// API: GET|POST /api/export - the whole selection as csv, xls or pdf.
// This is why it exists: the dashboard download must cover every selected
// barrier (18k and up), which no browser-side builder can hold. Filters
// arrive as query params on both verbs; the selection (ids) and the print
// part arrive in the request body, so an 18k-row selection never has to fit
// a URL. Rows are streamed from the database in batches (lib/server/export*).
// Authenticated like the other dashboard GETs (extraction needs a session
// or ADMIN_TOKEN); anonymous gets 404 camouflage. Throttled tighter.
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

import {
  EXPORT_MAX_ROWS,
  PDF_PART_ROWS,
  refusalMessage,
  XLS_SHEET_ROWS,
} from "../../lib/export/limits.ts";

import { exportThrottle, routeClientKey } from "../../lib/server/throttle.ts";
import { checkDbThrottle } from "../../lib/server/sql/throttle.ts";
import { FMT_EXT, FMT_MIME, isFmt } from "../../lib/export/format.ts";
import { loadServerConfig } from "../../lib/server/config.ts";
import { streamExportCsv } from "../../lib/server/exportCsv.ts";
import { streamExportXls } from "../../lib/server/exportXls.ts";
import { getCompanyName } from "../../lib/company.ts";
import type { ExportScope } from "../../lib/server/exportRows.ts";
import { streamPrintReport } from "../../lib/server/exportPdf.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import { requireDataAuth } from "../../lib/server/auth.ts";
import { pdfPartCount } from "../../lib/export/parts.ts";
import { parseFilterQuery } from "./_params.ts";

import { define } from "../../utils.ts";

import type { Fmt } from "../../lib/export/format.ts";

// Request payload: the filters always come from the query string (one parser
// for GET and POST alike), the selection and the print part from the body,
// where an 18k-id list fits comfortably.
interface ExportRequest {
  format: Fmt;
  ids?: number[];
  part: number;
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

// parsePart: 1-based print part; anything invalid falls back to part 1.
function parsePart(raw: unknown): number {
  const n = typeof raw === "number" && Number.isSafeInteger(raw) ? raw : 0;
  return n > 0 ? n : 1;
}

// readBody: the optional JSON payload. A missing or non-JSON body is a valid
// request (full filtered scope, first print part), so GET works unchanged.
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
    // Same budget as the in-memory bucket: a multi-part PDF export spends one
    // request per print part, and a 200k-row selection is 100 parts.
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

  const requested = body.format ?? sp.get("format") ?? "csv";
  if (!isFmt(requested)) {
    return badRequest("format must be csv, xls or pdf", requestId);
  }
  const req: ExportRequest = {
    format: requested,
    ids: parseIds(body.ids),
    part: parsePart(body.part),
  };
  const query: BarriersQuery = {
    ...parseFilterQuery(sp),
    ids: req.ids,
    page: 1,
    sortCol: sp.get("sortCol") ?? undefined,
    sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
  };

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

// respond: wires the format stream and its headers. CSV and xls download as
// one file (xls split into worksheets past Excel's sheet limit); pdf is a
// print fragment, one part per request, so the caller prints them in order.
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
  if (req.format === "xls") {
    return new Response(
      streamExportXls(exportBatches(scope), {
        companyName,
        kpi: scope.kpi,
        sheets: Math.max(1, Math.ceil(total / XLS_SHEET_ROWS)),
      }),
      { status: 200, headers: fileHeaders(headers, "xls") },
    );
  }
  if (req.format === "pdf") {
    const parts = pdfPartCount(total);
    const part = Math.min(req.part, parts);
    // A print fragment, not a file: no download disposition, the caller
    // injects it into the print node and prints it.
    return new Response(
      streamPrintReport(
        exportBatches(scope, {
          offset: (part - 1) * PDF_PART_ROWS,
          limit: PDF_PART_ROWS,
        }),
        {
          companyName,
          kpi: scope.kpi,
          part: { index: part, parts, total },
        },
      ),
      {
        status: 200,
        headers: {
          ...headers,
          "x-export-parts": String(parts),
          "content-type": FMT_MIME.pdf,
        },
      },
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
  format: "csv" | "xls",
): Record<string, string> {
  return {
    ...base,
    "content-type": FMT_MIME[format],
    "content-disposition": `attachment; filename="barreiras${FMT_EXT[format]}"`,
  };
}
