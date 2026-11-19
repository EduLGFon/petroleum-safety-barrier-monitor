// Unit tests for HTTP adapter auth mapping - session expiry signals - plus
// the ETag revalidation cache contract (collections and single rows).
// This is why they exist: the dashboard redirects to /login on
// AuthExpiredError, so the 401/404 mapping (and the row-level 404=null
// contract) must stay exact without a database or server.
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
} from "jsr:@std/assert@^1";

import { AuthExpiredError, httpAdapterFactory } from "./http.ts";

import { isAuthExpired } from "./http.ts";

import type { WireBarrier } from "../wireTypes.ts";

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

Deno.test("base URL controls relative vs absolute request targets", async () => {
  const cases = [
    ["", "/api/kpi?"],
    ["https://api.example.com", "https://api.example.com/api/kpi?"],
  ] as const;
  for (const [baseUrl, expected] of cases) {
    const api = httpAdapterFactory(baseUrl);
    const urls: string[] = [];
    const prev = globalThis.fetch;
    globalThis.fetch = ((input: unknown) => {
      urls.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ total: 0 }), { status: 200 }),
      );
    }) as typeof fetch;
    try {
      await api.getKpi({});
      assertEquals(urls, [expected]);
    } finally {
      globalThis.fetch = prev;
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

// wireRow: a complete minimal wire barrier the resolver accepts, so a
// single-row response can be exercised without a server.
function wireRow(id: number, tag: string): WireBarrier {
  return {
    id,
    tag,
    typologyId: 1,
    locationId: 1,
    locDescId: 1,
    criticalityId: 1,
    categoryId: 1,
    groupingId: 1,
    ownerId: -1,
    availabilityId: 1,
    comments: "",
    actionPlan: "",
    statusSince: "2026-01-01T00:00:00Z",
    statusHistory: [],
    origin: "",
    externalCode: "",
    locationName: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
  };
}

Deno.test("getBarrierById revalidates with ETag and serves 304 from memory", async () => {
  // Regression: single rows used to bypass the per-adapter ETag cache, so
  // every detail-modal fetch re-downloaded and re-parsed the whole row.
  const api = httpAdapterFactory("http://x");
  const seen: Array<Record<string, string>> = [];
  const prev = globalThis.fetch;
  const tag = '"row1"';
  const row = wireRow(9, "V-01");
  globalThis.fetch = ((_url: unknown, init?: { headers?: unknown }) => {
    seen.push({ ...(init?.headers as Record<string, string>) });
    if (
      (init?.headers as Record<string, string>)?.["If-None-Match"] === tag
    ) {
      return Promise.resolve(
        new Response(null, { status: 304, headers: { etag: tag } }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(row), {
        status: 200,
        headers: { etag: tag },
      }),
    );
  }) as typeof fetch;
  try {
    const first = await api.getBarrierById(9);
    assertStrictEquals(first?.id, 9);
    assertStrictEquals(seen[0]?.["If-None-Match"], undefined);
    const second = await api.getBarrierById(9);
    assertStrictEquals(second?.id, 9);
    assertStrictEquals(seen[1]?.["If-None-Match"], tag);
    assertStrictEquals(seen.length, 2);
  } finally {
    globalThis.fetch = prev;
  }
});

Deno.test("getBarrierById refreshes the row cache when the ETag changes", async () => {
  const api = httpAdapterFactory("http://y");
  const prev = globalThis.fetch;
  let tag = '"r1"';
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify(wireRow(9, tag === '"r1"' ? "OLD" : "NEW")),
        { status: 200, headers: { etag: tag } },
      ),
    )) as typeof fetch;
  try {
    assertStrictEquals((await api.getBarrierById(9))?.tag, "OLD");
    tag = '"r2"';
    assertStrictEquals((await api.getBarrierById(9))?.tag, "NEW");
  } finally {
    globalThis.fetch = prev;
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
  globalThis.fetch = ((_url: unknown, init?: { headers?: unknown }) => {
    seen.push({ ...(init?.headers as Record<string, string>) });
    if (
      (init?.headers as Record<string, string>)?.["If-None-Match"] === tag
    ) {
      return Promise.resolve(
        new Response(null, { status: 304, headers: { etag: tag } }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { etag: tag },
      }),
    );
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
  globalThis.fetch = (() =>
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
