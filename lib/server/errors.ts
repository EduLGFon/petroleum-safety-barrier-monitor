// API error envelope - every route answers failures the same way.
// This is why it exists: five routes each hand-rolled { error } with ad-hoc
// messages; now the shape is { error, code, requestId } plus an x-request-id
// header, so operators can correlate a client report with a server log line.
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  requestId: string;
}

// newRequestId: one id per request, echoed in the body and the header.
export function newRequestId(): string {
  return crypto.randomUUID();
}

// apiError: builds the JSON envelope with the correlation header.
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: ApiErrorBody = { error: message, code, requestId };
  return Response.json(body, {
    status,
    headers: { "x-request-id": requestId, ...extraHeaders },
  });
}

export function badRequest(message: string, requestId: string): Response {
  return apiError(400, "BAD_REQUEST", message, requestId);
}

export function notFound(message: string, requestId: string): Response {
  return apiError(404, "NOT_FOUND", message, requestId);
}

export function unauthorized(message: string, requestId: string): Response {
  return apiError(401, "UNAUTHORIZED", message, requestId);
}

export function rateLimited(
  message: string,
  requestId: string,
  retryAfterMs: number,
): Response {
  return apiError(429, "RATE_LIMITED", message, requestId, {
    "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
  });
}

// internal: logs the real error server-side, returns the envelope with the
// caller-supplied public message (never leaks stack/columns to clients).
export function internal(
  logLabel: string,
  err: unknown,
  requestId: string,
  publicMessage: string,
): Response {
  console.error(`[${logLabel}] requestId=${requestId}`, err);
  return apiError(500, "INTERNAL", publicMessage, requestId);
}
