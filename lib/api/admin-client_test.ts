// Unit tests for the admin API client - structured failures.
// This is why they exist: settings managers display err.message, so the
// thrown error must stay an Error with a localized message while preserving
// status/code/requestId for operators and redirect logic.
import {
  assert,
  assertInstanceOf,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import { adminApi, AdminApiError } from "./admin-client.ts";

function stubFetch(status: number, body: unknown): () => void {
  const prev = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "x-request-id": "hdr-1" },
      }),
    )) as typeof fetch;
  return () => {
    globalThis.fetch = prev;
  };
}

Deno.test("adminApi throws AdminApiError with envelope details", async () => {
  const restore = stubFetch(403, {
    error: "admin only",
    code: "FORBIDDEN",
    requestId: "req-1",
  });
  try {
    await adminApi("/api/users");
    throw new Error("unreachable");
  } catch (err) {
    assertInstanceOf(err, AdminApiError);
    assertStrictEquals(
      (err as AdminApiError).message,
      "Acesso restrito ao administrador",
    );
    assertStrictEquals((err as AdminApiError).status, 403);
    assertStrictEquals((err as AdminApiError).code, "FORBIDDEN");
    assertStrictEquals((err as AdminApiError).requestId, "req-1");
  } finally {
    restore();
  }
});

Deno.test("adminApi falls back to Erro status on non-JSON bodies", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("bad gateway", { status: 502 }),
    )) as typeof fetch;
  try {
    await adminApi("/api/users");
    throw new Error("unreachable");
  } catch (err) {
    assertInstanceOf(err, AdminApiError);
    assert((err as Error).message.includes("502"));
    assertStrictEquals((err as AdminApiError).status, 502);
  } finally {
    globalThis.fetch = prev;
  }
});
