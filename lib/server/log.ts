// Central server logger - one structured logging contract for every module.
// This is why it exists: console.* calls grew ad-hoc prefixes ([db], [sync],
// [poll], [ops]) with no levels, no timestamps, no request correlation, and
// no secret redaction. Every server module logs through here instead, so
// docker logs stay greppable (level + scope + requestId on each line), ops
// can raise verbosity with LOG_LEVEL without a deploy, and secrets never
// reach stderr. Browser code never imports this (server-only by design).
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "text" | "json";
export type LogFields = Record<string, unknown>;
export interface LogBindings {
  scope?: string;
  requestId?: string;
  [key: string]: unknown;
}
export type LineLogger = (line: string) => void;
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  audit(message: string, fields?: LogFields): void;
  child(bindings: LogBindings): Logger;
  line(level?: LogLevel): LineLogger;
}
export type EnvGetter = (name: string) => string | undefined;
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
// safeEnv: Deno.env throws when permissions are missing (tests run with a
// narrow allow-env). A logger must never throw, so env reads fall back.
function safeEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}
// parseLogLevel: LOG_LEVEL in {debug,info,warn,error}, case-insensitive.
// Unknown or missing values fail closed to info (success-quiet default).
export function parseLogLevel(
  raw: string | undefined,
  fallback: LogLevel = "info",
): LogLevel {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return fallback;
}
// parseLogFormat: LOG_FORMAT in {text,json}. Unknown values stay text so a
// typo never breaks log aggregation with an unreadable stream.
export function parseLogFormat(
  raw: string | undefined,
  fallback: LogFormat = "text",
): LogFormat {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "text" || v === "json") return v;
  return fallback;
}
// SECRET_SUBSTRINGS: key fragments whose values are secrets. Kept narrow on
// purpose: "author" must never match (barrier authors are domain data), so
// "authorization" is listed whole and bare "session"/"auth" are excluded.
// Values carrying these keys (at any nesting depth) become [REDACTED].
// PRIVACY: never extend this list to personal-data fields without an ADR.
const SECRET_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "database_url",
  "smtp",
  "mail_pass",
  "mailpass",
  "admin_token",
  "api_key",
  "apikey",
  "credential",
];
function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_SUBSTRINGS.some((s) => lower.includes(s));
}
// looksLikeConnectionString: postgres URLs sometimes surface inside error
// messages or notes. Redact the value even when the key looks innocent.
function looksLikeConnectionString(value: string): boolean {
  return /postgres(ql)?:\/\//i.test(value);
}
const MAX_STRING = 2000;
function truncate(value: string): string {
  if (value.length <= MAX_STRING) return value;
  return `${value.slice(0, MAX_STRING)}...[truncated ${value.length}]`;
}
// normalizeValue: Error objects become plain data (message plus name/stack),
// strings truncate, nested secrets redact. Depth-capped with a circular
// guard so a malformed payload can never throw out of the logger.
function normalizeValue(
  key: string,
  value: unknown,
  depth: number,
  seen: Set<object>,
): unknown {
  if (isSecretKey(key)) return "[REDACTED]";
  if (typeof value === "string") {
    if (looksLikeConnectionString(value)) return "[REDACTED connection-string]";
    return truncate(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    if (depth <= 0) return "[depth-capped]";
    return value.map((item) =>
      normalizeValue(key, item, depth - 1, seen) as unknown
    );
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    if (depth <= 0) return "[depth-capped]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeValue(k, v, depth - 1, seen);
    }
    seen.delete(value);
    return out;
  }
  return value;
}
// sanitizeFields: redacted, truncated, throw-free copy of log fields.
export function sanitizeFields(fields: LogFields): LogFields {
  const seen = new Set<object>();
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = normalizeValue(k, v, 5, seen);
  }
  return out;
}
// safeStringify: JSON with a circular guard, never throws.
function safeStringify(value: unknown): string {
  const seen = new Set<object>();
  try {
    return JSON.stringify(value, (_key, nested: unknown) => {
      if (nested !== null && typeof nested === "object") {
        if (seen.has(nested as object)) return "[Circular]";
        seen.add(nested as object);
      }
      return nested as unknown;
    }) ?? "[unserializable]";
  } catch {
    return "[unserializable]";
  }
}
// renderValue: single-line text rendering for one field value.
function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return value.includes(" ") ? JSON.stringify(value) : value;
  }
  return safeStringify(value);
}
// formatText: `2026-10-08T..Z INFO  [scope] requestId=.. msg k=v ...`.
// Scope and requestId lead so `grep requestId=` maps a user report to logs.
function formatText(
  ts: string,
  level: LogLevel,
  scope: string | undefined,
  requestId: string | undefined,
  message: string,
  fields: LogFields,
): string {
  const parts: string[] = [ts, level.toUpperCase().padEnd(5)];
  if (scope) parts.push(`[${scope}]`);
  if (requestId) parts.push(`requestId=${requestId}`);
  parts.push(message);
  const rest = Object.entries(fields).filter(([k]) =>
    k !== "requestId" || requestId === undefined
  );
  rest.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [k, v] of rest) parts.push(`${k}=${renderValue(v)}`);
  return parts.join(" ").replace(/\n/g, " | ");
}
export interface CreateLoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  scope?: string;
  requestId?: string;
  bindings?: LogBindings;
  now?: () => string;
  out?: (line: string) => void;
  errOut?: (line: string) => void;
  env?: EnvGetter;
}
function resolveLevel(
  explicit: LogLevel | undefined,
  env: EnvGetter,
): LogLevel {
  if (explicit) return explicit;
  return parseLogLevel(env("LOG_LEVEL"));
}
function resolveFormat(
  explicit: LogFormat | undefined,
  env: EnvGetter,
): LogFormat {
  if (explicit) return explicit;
  return parseLogFormat(env("LOG_FORMAT"));
}
// createLogger: level/format default from LOG_LEVEL/LOG_FORMAT (read per
// emit, so toggling env and recreating is enough in tests and containers).
// debug/info go to out (stdout), warn/error to errOut (stderr). Emits never
// throw: a broken sink is swallowed after one stderr attempt.
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const env = options.env ?? safeEnv;
  const base: LogBindings = {
    ...(options.scope !== undefined ? { scope: options.scope } : {}),
    ...(options.requestId !== undefined
      ? { requestId: options.requestId }
      : {}),
    ...(options.bindings ?? {}),
  };
  const now = options.now ?? (() => new Date().toISOString());
  const out = options.out ?? ((line: string) => console.log(line));
  const errOut = options.errOut ?? ((line: string) => console.error(line));
  const emit = (
    level: LogLevel,
    message: string,
    fields: LogFields = {},
  ): void => {
    try {
      const configured = resolveLevel(options.level, env);
      if (LEVEL_ORDER[level] < LEVEL_ORDER[configured]) return;
      const format = resolveFormat(options.format, env);
      const merged: LogFields = { ...base, ...sanitizeFields(fields) };
      const scope = typeof merged.scope === "string" ? merged.scope : undefined;
      const requestId = typeof merged.requestId === "string"
        ? merged.requestId
        : undefined;
      const { scope: _s, requestId: _r, ...rest } = merged;
      const ts = now();
      const line = format === "json"
        ? safeStringify({
          ts,
          level,
          ...(scope ? { scope } : {}),
          ...(requestId ? { requestId } : {}),
          msg: message,
          ...rest,
        })
        : formatText(ts, level, scope, requestId, message, rest);
      (level === "warn" || level === "error" ? errOut : out)(line);
    } catch {
      // Logger failures must never break the request path.
    }
  };
  const logger: Logger = {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    audit: (m, f) => emit("info", m, { ...f, audit: true }),
    child: (bindings) =>
      createLogger({ ...options, bindings: { ...base, ...bindings }, env }),
    line: (level = "info") => (line) => emit(level, line),
  };
  return logger;
}
// log: process-wide root logger (scope unset). Request and background code
// derive children via log.child() or forRequest() so every line carries its
// correlation ids without threading a param through pure functions.
export const log: Logger = createLogger();
// forRequest: child logger pre-bound with requestId (and optional scope),
// so API handlers log one line per event with the same id the error
// envelope and x-request-id header carry back to the client.
export function forRequest(requestId: string, scope?: string): Logger {
  return log.child(scope ? { requestId, scope } : { requestId });
}
// toLineLogger: adapter for legacy `logger?: (line: string) => void`
// callbacks (alert cycles, poll loops). New code passes a Logger directly;
// call sites that still take a line callback receive logger.line("info").
// Keep the adapter unscoped (root logger, or forRequest without scope)
// when the lines already carry their own [tag] prefix: a scoped adapter
// would print doubled brackets like `[alerts] [alerts] ...`.
export function toLineLogger(
  logger: Logger,
  level: LogLevel = "info",
): LineLogger {
  return logger.line(level);
}
