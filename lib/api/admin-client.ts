// Admin API client - same-origin JSON fetch for the settings admin tab.
// This is why it exists: Users, Recipients, and Rules managers share one
// fetch wrapper so auth errors stay consistent and English wire errors map
// to pt-BR UI strings at the boundary.
import { toPtError } from "./error-pt.ts";

// AdminApiError: structured failure preserving the wire envelope (status,
// code, requestId) alongside the localized message. Callers display
// `message`; operators correlate with `requestId`; redirects branch on
// `status` (401/404 = session gone, 403 = authenticated but not admin).
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  constructor(
    message: string,
    status: number,
    code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// api: same-origin JSON fetch; throws a localized AdminApiError on non-OK.
export async function adminApi(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let code: string | undefined;
    let requestId: string | undefined = res.headers.get("x-request-id") ??
      undefined;
    try {
      const data = await res.json() as {
        error?: string;
        code?: string;
        requestId?: string;
      };
      if (data.error) message = toPtError(data.error);
      if (data.code) code = data.code;
      if (data.requestId) requestId = data.requestId;
    } catch {
      // Keep the status fallback when the body is not JSON.
    }
    throw new AdminApiError(message, res.status, code, requestId);
  }
  return await res.json();
}
