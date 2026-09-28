// Server export client - pulls the whole selection out of /api/export.
// This is why it exists: the browser only holds one page of rows, so every
// format arrives as a streamed file download. The selection travels in the
// POST body, so an 18k-id selection never has to fit a URL. Every format
// covers the same rows as the table (scope filters plus the selected ids).
import { FMT_EXT } from "../../lib/export/format.ts";
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

// exportQueryString: the filter scope as URL params; the selection stays in
// the body.
function exportQueryString(query: BarriersQuery): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "" && k !== "ids") {
      qs.set(k, String(v));
    }
  }
  return qs.toString();
}

// requestFile: one export request, answered by a file download. Throws the
// route's error message on a refusal (over the row ceiling, bad format,
// throttle) so the menu can show what actually went wrong.
async function requestFile(
  req: ServerExportRequest,
): Promise<{ res: Response }> {
  const qs = exportQueryString(req.query);
  const res = await fetch(
    `${req.baseUrl}/api/export?${qs}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: req.kind, ids: req.ids }),
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

// downloadBlob: saves a response body as a file without mounting anything
// into the page DOM (a large report injected for printing is what used to
// freeze the tab).
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// exportFromServer: runs the export for the whole selection. Every format
// comes back as one file download, so a selection too large for any preview
// still comes out complete.
export async function exportFromServer(
  req: ServerExportRequest,
): Promise<void> {
  if (!req.baseUrl) throw new Error("Exportação indisponível (sem baseUrl)");
  const { res } = await requestFile(req);
  downloadBlob(await res.blob(), `${req.filename}${FMT_EXT[req.kind]}`);
}
