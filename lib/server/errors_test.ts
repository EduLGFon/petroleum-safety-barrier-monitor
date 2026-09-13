// Unit tests for the API error envelope (P4).
import {
  apiError,
  badRequest,
  internal,
  notFound,
  rateLimited,
  unauthorized,
} from "./errors.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

async function body(res: Response) {
  return await res.json() as {
    error: string;
    code: string;
    requestId: string;
  };
}

Deno.test("apiError carries the envelope and the correlation header", async () => {
  const res = badRequest("Invalid barrier id", "req-1");
  assertStrictEquals(res.status, 400);
  assertStrictEquals(res.headers.get("x-request-id"), "req-1");
  const b = await body(res);
  assertStrictEquals(b.error, "Invalid barrier id");
  assertStrictEquals(b.code, "BAD_REQUEST");
  assertStrictEquals(b.requestId, "req-1");
});

Deno.test("notFound and unauthorized use their codes", async () => {
  assertStrictEquals((await body(notFound("gone", "r"))).code, "NOT_FOUND");
  assertStrictEquals(
    (await body(unauthorized("nope", "r"))).code,
    "UNAUTHORIZED",
  );
  assertStrictEquals(unauthorized("nope", "r").status, 401);
});

Deno.test("rateLimited sets 429 with a retry-after hint", async () => {
  const res = rateLimited("slow down", "r", 61_000);
  assertStrictEquals(res.status, 429);
  assertStrictEquals(res.headers.get("retry-after"), "61");
  assertStrictEquals((await body(res)).code, "RATE_LIMITED");
});

Deno.test("internal hides details but logs with the request id", async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  let res: Response;
  try {
    res = internal("GET /api/x", new Error("db exploded"), "req-9", "Failed");
  } finally {
    console.error = original;
  }
  assertStrictEquals(res!.status, 500);
  const b = await body(res!);
  assertStrictEquals(b.error, "Failed");
  assertStrictEquals(b.code, "INTERNAL");
  assertStrictEquals(b.requestId, "req-9");
  assertStrictEquals(logged.length, 1);
  assertStrictEquals(String(logged[0]).includes("req-9"), true);
});

Deno.test("apiError exposes no stack or columns", async () => {
  const res = apiError(500, "INTERNAL", "Failed", "r");
  const raw = await res.text();
  assertStrictEquals(raw.includes("stack"), false);
  assertStrictEquals(raw.includes("column"), false);
});
