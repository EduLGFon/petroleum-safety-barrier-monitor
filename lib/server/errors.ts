// API error envelope - every route answers failures the same way.
// This is why it exists: five routes each hand-rolled { error } with ad-hoc
// messages; now the shape is { error, code, requestId } plus an x-request-id
// header, so operators can correlate a client report with a server log line.
//
// Successes stay unwrapped (domain JSON as-is, so existing clients keep
// working) but always carry the same x-request-id header via ok()/created().
// Error codes: BAD_REQUEST (400), UNAUTHORIZED (401, missing or dead
// credential), FORBIDDEN (403, authenticated but lacking the role), NOT_FOUND
// (404, missing row or anonymous camouflage), RATE_LIMITED (429),
// UNAVAILABLE (503, dependency outage), INTERNAL (500, never leaks details).
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
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

// ok: success envelope - same domain body, plus the correlation header.
// Every JSON success goes through here so clients can always report the
// x-request-id alongside an error envelope id.
export function ok(
  data: unknown,
  requestId: string,
  init: ResponseInit = {},
): Response {
  return Response.json(data, {
    ...init,
    headers: { "x-request-id": requestId, ...(init.headers ?? {}) },
  });
}

// created: 201 success for POST creates, with the correlation header.
export function created(data: unknown, requestId: string): Response {
  return ok(data, requestId, { status: 201 });
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

// forbidden: authenticated but lacking the role (e.g. non-admin asking for
// deleted scope). 403, never 401 - a valid credential must not read as a
// dead one, or clients redirect to login in a loop.
export function forbidden(message: string, requestId: string): Response {
  return apiError(403, "FORBIDDEN", message, requestId);
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

// unavailable: dependency failure (DB blip) is 503 with Retry-After, never
// 401 - a dead database must not read as a dead credential.
export function unavailable(
  message: string,
  requestId: string,
  retryAfterMs = 5000,
): Response {
  return apiError(503, "UNAVAILABLE", message, requestId, {
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
