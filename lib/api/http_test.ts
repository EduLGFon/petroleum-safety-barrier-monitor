// Unit tests for HTTP adapter auth mapping - session expiry signals.
// This is why they exist: the dashboard redirects to /login on
// AuthExpiredError, so the 401/404 mapping (and the row-level 404=null
// contract) must stay exact without a database or server.
import {
  assert,
  assertInstanceOf,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import { AuthExpiredError, httpAdapterFactory } from "./http.ts";

import { isAuthExpired } from "./http.ts";

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
  let restore = stubFetch(404, { error: "Barrier not found" });
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

Deno.test("getBarrierById treats camouflaged 404 as expired", async () => {
  const api = httpAdapterFactory("http://x");
  const restore = stubFetch(404, {
    error: "not found",
    code: "NOT_FOUND",
    requestId: "r",
  });
  try {
    await api.getBarrierById(9);
    throw new Error("unreachable");
  } catch (err) {
    assert(isAuthExpired(err));
    assertStrictEquals((err as AuthExpiredError).status, 404);
  } finally {
    restore();
  }
});

Deno.test("isAuthExpired rejects ordinary errors", () => {
  assert(!isAuthExpired(new Error("API error 500: /api/kpi")));
  assert(!isAuthExpired(null));
});

Deno.test("fetchJson revalidates with ETag and serves 304 from memory", async () => {
  const api = httpAdapterFactory("http://x");
  const seen: Array<Record<string, string>> = [];
  const prev = globalThis.fetch;
  const tag = '"abc123"';
  const snapshot = {
    total: 2,
    available: 1,
    outOfService: 0,
    contingencyOutage: 0,
    degradedContingency: 0,
    degraded: 0,
    unavailable: 0,
    other: 1,
    compliant: 1,
    nonCompliant: 1,
    criticalNonCompliant: 0,
    withoutActionPlan: 0,
    pctCompliant: 50,
  };
  globalThis.fetch = (async (_url: unknown, init?: { headers?: unknown }) => {
    seen.push({ ...(init?.headers as Record<string, string>) });
    if (
      (init?.headers as Record<string, string>)?.["If-None-Match"] === tag
    ) {
      return new Response(null, { status: 304, headers: { etag: tag } });
    }
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { etag: tag },
    });
  }) as typeof fetch;
  try {
    // First call: no tag sent, body cached under the returned ETag.
    const first = await api.getKpi({});
    assertStrictEquals(first.total, 2);
    assertStrictEquals(seen[0]?.["If-None-Match"], undefined);
    // Second call: tag revalidated, 304 served from memory.
    const second = await api.getKpi({});
    assertStrictEquals(second.total, 2);
    assertStrictEquals(seen[1]?.["If-None-Match"], tag);
    assertStrictEquals(seen.length, 2);
  } finally {
    globalThis.fetch = prev;
  }
});

Deno.test("fetchJson refreshes the cache when the ETag changes", async () => {
  const api = httpAdapterFactory("http://y");
  const prev = globalThis.fetch;
  let tag = '"v1"';
  globalThis.fetch = (async () =>
    Promise.resolve(
      new Response(JSON.stringify({ total: tag === '"v1"' ? 1 : 2 }), {
        status: 200,
        headers: { etag: tag },
      }),
    )) as typeof fetch;
  try {
    assertStrictEquals((await api.getKpi({})).total, 1);
    tag = '"v2"';
    assertStrictEquals((await api.getKpi({})).total, 2);
  } finally {
    globalThis.fetch = prev;
  }
});
