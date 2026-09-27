// Server export client - pulls the whole selection out of /api/export.
// This is why it exists: the browser only holds one page of rows, so csv and
// xls arrive as a streamed file download and pdf is printed part by part
// from the streamed report markup. The selection travels in the POST body,
// so an 18k-id selection never has to fit a URL. Every format covers the
// same rows as the table (scope filters plus the selected ids).
import { FMT_EXT } from "../../lib/export/format.ts";
import { pdfPartTitle, printReportPart } from "../../lib/export/pdf.ts";
import { pdfPartCount } from "../../lib/export/parts.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import type { Fmt } from "../../lib/export/format.ts";

export interface ServerExportRequest {
  baseUrl: string;
  kind: Fmt;
  /** Selected ids; empty exports the whole filtered scope. */
  ids: number[];
  /** Filename without extension (the format adds its own). */
  filename: string;
  /** Filter scope from scopeWireQuery (sort included, no paging). */
  query: BarriersQuery;
  /** Called when the session is gone, so the caller can send the user to login. */
  onExpired: () => void;
}

// exportQueryString: the filter scope as URL params; the selection and the
// print part stay in the body.
function exportQueryString(query: BarriersQuery): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "" && k !== "ids") {
      qs.set(k, String(v));
    }
  }
  return qs.toString();
}

// requestPart: one export request. Throws the route's error message on a
// refusal (over the row ceiling, bad format, throttle) so the menu can show
// what actually went wrong.
async function requestPart(
  req: ServerExportRequest,
  part: number,
): Promise<{ res: Response }> {
  const qs = exportQueryString(req.query);
  const res = await fetch(
    `${req.baseUrl}/api/export?${qs}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: req.kind, ids: req.ids, part }),
    },
  );
  if (res.status === 401 || res.status === 404) {
    req.onExpired();
    throw new Error("Sessão expirada - entre novamente para exportar");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new Error(detail);
  }
  return { res };
}

// exportFromServer: runs the export for the whole selection. csv/xls come
// back as one file; pdf is fetched part by part and printed in order, so a
// selection too large for one print job still comes out complete.
export async function exportFromServer(
  req: ServerExportRequest,
): Promise<void> {
  if (!req.baseUrl) throw new Error("Exportação indisponível (sem baseUrl)");
  if (req.kind === "pdf") return printServerParts(req);
  const { res } = await requestPart(req, 1);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${req.filename}${FMT_EXT[req.kind]}`;
  a.click();
  URL.revokeObjectURL(url);
}

// printServerParts: prints the report one part at a time. The first response
// carries the scope total, which decides how many parts follow; each part
// lands in the hidden print node and opens its own print dialog.
async function printServerParts(req: ServerExportRequest): Promise<void> {
  const first = await requestPart(req, 1);
  const total = Number(first.res.headers.get("x-export-total") ?? 0);
  const parts = pdfPartCount(total);
  for (let part = 1; part <= parts; part++) {
    const { res } = part === 1 ? first : await requestPart(req, part);
    const html = await res.text();
    await printReportPart(
      html,
      pdfPartTitle(req.filename, part, parts),
    );
  }
}
