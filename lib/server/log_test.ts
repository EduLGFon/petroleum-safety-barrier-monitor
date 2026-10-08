// Unit tests for the central server logger - levels, formats, redaction.
import {
  createLogger,
  forRequest,
  parseLogFormat,
  parseLogLevel,
  sanitizeFields,
  toLineLogger,
} from "./log.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

function capture(env: Record<string, string> = {}) {
  const out: string[] = [];
  const errOut: string[] = [];
  const logger = createLogger({
    out: (line) => out.push(line),
    errOut: (line) => errOut.push(line),
    env: (name) => env[name],
    now: () => "2026-10-08T00:00:00.000Z",
  });
  return { out, errOut, logger };
}
Deno.test("parseLogLevel accepts known levels case-insensitively", () => {
  assertStrictEquals(parseLogLevel("debug"), "debug");
  assertStrictEquals(parseLogLevel(" INFO "), "info");
  assertStrictEquals(parseLogLevel("Warn"), "warn");
  assertStrictEquals(parseLogLevel("ERROR"), "error");
  assertStrictEquals(parseLogLevel(undefined), "info");
  assertStrictEquals(parseLogLevel("verbose"), "info");
  assertStrictEquals(parseLogLevel(""), "info");
});
Deno.test("parseLogFormat accepts text and json only", () => {
  assertStrictEquals(parseLogFormat("json"), "json");
  assertStrictEquals(parseLogFormat(" JSON "), "json");
  assertStrictEquals(parseLogFormat(undefined), "text");
  assertStrictEquals(parseLogFormat("yaml"), "text");
});
Deno.test("level filtering silences debug at info and routes warn to stderr", () => {
  const { out, errOut, logger } = capture({ LOG_LEVEL: "info" });
  logger.debug("quiet");
  logger.info("hello", { scope: "api" });
  logger.warn("careful");
  logger.error("boom");
  assertStrictEquals(out.length, 1);
  assertStrictEquals(errOut.length, 2);
  assertStrictEquals(out[0]!.includes("hello"), true);
  assertStrictEquals(out[0]!.includes("INFO"), true);
});
Deno.test("debug level enables debug lines", () => {
  const { out, logger } = capture({ LOG_LEVEL: "debug" });
  logger.debug("verbose detail", { scope: "db" });
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.includes("[db]"), true);
});
Deno.test("text lines carry timestamp scope and requestId", () => {
  const { out, logger } = capture();
  logger.child({ scope: "sync", requestId: "req-1" }).info("finished", {
    runId: 7,
  });
  const line = out[0]!;
  assertStrictEquals(line.includes("2026-10-08T00:00:00.000Z"), true);
  assertStrictEquals(line.includes("[sync]"), true);
  assertStrictEquals(line.includes("requestId=req-1"), true);
  assertStrictEquals(line.includes("runId=7"), true);
});
Deno.test("json format emits parseable structured lines", () => {
  const { errOut, logger } = capture({ LOG_FORMAT: "json" });
  logger.child({ scope: "api", requestId: "r9" }).warn("slow query", {
    durationMs: 120,
  });
  const parsed = JSON.parse(errOut[0]!) as Record<string, unknown>;
  assertStrictEquals(parsed["level"], "warn");
  assertStrictEquals(parsed["scope"], "api");
  assertStrictEquals(parsed["requestId"], "r9");
  assertStrictEquals(parsed["msg"], "slow query");
  assertStrictEquals(parsed["durationMs"], 120);
});
Deno.test("json format routes through the error sink for warn", () => {
  const lines: string[] = [];
  const logger = createLogger({
    format: "json",
    out: (l) => lines.push(`out:${l}`),
    errOut: (l) => lines.push(`err:${l}`),
    now: () => "2026-10-08T00:00:00.000Z",
  });
  logger.warn("slow", { scope: "api", requestId: "r9", durationMs: 5 });
  assertStrictEquals(lines.length, 1);
  const body = JSON.parse(lines[0]!.replace(/^err:/, "")) as {
    level: string;
    scope: string;
    requestId: string;
    msg: string;
  };
  assertStrictEquals(body.level, "warn");
  assertStrictEquals(body.scope, "api");
  assertStrictEquals(body.requestId, "r9");
  assertStrictEquals(body.msg, "slow");
});
Deno.test("secrets redact by key and connection strings by value", () => {
  const redacted = sanitizeFields({
    password: "hunter2",
    adminToken: "abc",
    nested: { smtpPass: "x", author: "Maria" },
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    note: "uses postgres://u:p@host/db inside",
  });
  assertStrictEquals(redacted.password, "[REDACTED]");
  assertStrictEquals(redacted.adminToken, "[REDACTED]");
  assertStrictEquals(
    (redacted.nested as Record<string, unknown>).smtpPass,
    "[REDACTED]",
  );
  assertStrictEquals(
    (redacted.nested as Record<string, unknown>).author,
    "Maria",
  );
  assertStrictEquals(redacted.DATABASE_URL, "[REDACTED]");
  assertStrictEquals(redacted.note, "[REDACTED connection-string]");
});
Deno.test("author fields survive redaction while auth material does not", () => {
  const { out, logger } = capture();
  logger.info("status change", {
    author: "Maria Silva",
    authorization: "Bearer abc",
  });
  assertStrictEquals(out[0]!.includes("Maria Silva"), true);
  assertStrictEquals(out[0]!.includes("Bearer abc"), false);
  assertStrictEquals(out[0]!.includes("[REDACTED]"), true);
});
Deno.test("error values serialize without throwing", () => {
  const { errOut, logger } = capture({ LOG_FORMAT: "json" });
  logger.error("failed", { err: new Error("db exploded") });
  const body = JSON.parse(errOut[0]!) as {
    err: { message: string };
  };
  assertStrictEquals(body.err.message, "db exploded");
});
Deno.test("circular payloads never throw the logger", () => {
  const { out, logger } = capture();
  const self: Record<string, unknown> = {};
  self.me = self;
  logger.info("circular", { payload: self });
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.includes("[Circular]"), true);
});
Deno.test("child bindings merge and per-call fields win", () => {
  const { out, logger } = capture();
  const child = logger.child({ scope: "api", requestId: "r1" });
  child.info("hit", { route: "/api/kpi" });
  assertStrictEquals(out[0]!.includes("[api]"), true);
  assertStrictEquals(out[0]!.includes("requestId=r1"), true);
  child.info("override", { requestId: "r2" });
  assertStrictEquals(out[1]!.includes("requestId=r2"), true);
});
Deno.test("line adapter feeds legacy string callbacks", () => {
  const { out, logger } = capture();
  const line = toLineLogger(logger.child({ scope: "poll" }));
  line("[poll] scope=s ok");
  assertStrictEquals(out.length, 1);
  assertStrictEquals(out[0]!.includes("[poll] scope=s ok"), true);
});
Deno.test("audit marks info lines for greppable admin trails", () => {
  const { out, logger } = capture({ LOG_FORMAT: "json" });
  logger.audit("user created", { scope: "admin" });
  const body = JSON.parse(out[0]!) as { audit: boolean; msg: string };
  assertStrictEquals(body.audit, true);
  assertStrictEquals(body.msg, "user created");
});
Deno.test("forRequest binds the correlation id", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => lines.push(line);
  try {
    forRequest("req-42", "api").info("done");
  } finally {
    console.log = original;
  }
  assertStrictEquals(lines.length, 1);
  assertStrictEquals(lines[0]!.includes("requestId=req-42"), true);
});
