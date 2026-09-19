// Unit tests for HTTP adapter auth mapping - session expiry signals.
// This is why they exist: the dashboard redirects to /login on
// AuthExpiredError, so the 401/404 mapping (and the row-level 404=null
// contract) must stay exact without a database or server.
import { AuthExpiredError, httpAdapterFactory } from "./http.ts";
import { isAuthExpired } from "./http.ts";
import {
  assert,
  assertInstanceOf,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

function stubFetch(status: number, body: unknown = {}): () => void {
  const prev = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status }),
    )) as typeof fetch;
  return () => {
    globalThis.fetch = prev;
  };
}

Deno.test("fetchJson maps 401 and 404 to AuthExpiredError", async () => {
  const api = httpAdapterFactory("http://x");
  for (const status of [401, 404]) {
    const restore = stubFetch(status, { error: "x" });
    try {
      await api.getKpi({});
      throw new Error("unreachable");
    } catch (err) {
      assertInstanceOf(err, AuthExpiredError);
      assert(isAuthExpired(err));
      assertStrictEquals((err as AuthExpiredError).status, status);
    } finally {
      restore();
    }
  }
});

Deno.test("getBarrierById keeps row-level 404 as null, 401 as expired", async () => {
  const api = httpAdapterFactory("http://x");
  let restore = stubFetch(404, { error: "not found" });
  try {
    assertStrictEquals(await api.getBarrierById(9), null);
  } finally {
    restore();
  }
  restore = stubFetch(401, { error: "unauthorized" });
  try {
    await api.getBarrierById(9);
    throw new Error("unreachable");
  } catch (err) {
    assert(isAuthExpired(err));
  } finally {
    restore();
  }
});

Deno.test("isAuthExpired rejects ordinary errors", () => {
  assert(!isAuthExpired(new Error("API error 500: /api/kpi")));
  assert(!isAuthExpired(null));
});
