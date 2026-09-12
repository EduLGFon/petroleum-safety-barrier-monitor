// Unit tests for the Fracttal read-only client - validation, pagination,
// rate-limit, and auth flows, all against a mocked fetch.
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@^1";
import {
  buildListQuery,
  createFracttalClient,
  MAX_PAGE_SIZE,
  parseAsset,
  parseEnvelope,
  parsePage,
} from "./client.ts";

const DATA_URL = "https://app.fracttal.com/api";

function asset(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    code: "EQ-001",
    active: true,
    available: true,
    id_type_item: 2,
    description: "Bomba A",
    location_code: "ST-1",
    ...overrides,
  };
}

// fakeFetch: a programmable fetch that routes /api/* GETs and the token POST.
function fakeFetch(
  data: Record<
    string,
    { body: unknown; status?: number; headers?: Record<string, string> }
  >,
): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/oauth/token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "tok-1",
            refresh_token: "rt-1",
            token_type: "Bearer",
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    }
    const hit = Object.entries(data).find(([k]) => url.includes(k));
    if (!hit) return Promise.resolve(new Response("null", { status: 404 }));
    const [path, spec] = hit;
    void path;
    return Promise.resolve(
      new Response(JSON.stringify(spec.body), {
        status: spec.status ?? 200,
        headers: spec.headers,
      }),
    );
  };
  return { fetchImpl, calls };
}

const makeClient = (
  data: Parameters<typeof fakeFetch>[0],
  overrides: Partial<Parameters<typeof createFracttalClient>[0]> = {},
) =>
  createFracttalClient({
    baseUrl: DATA_URL,
    credentials: { key: "k", secret: "s" },
    maxRetries: 1,
    maxRateWaitMs: 5,
    fetchImpl: fakeFetch(data).fetchImpl,
    ...overrides,
  });

Deno.test("parseEnvelope normalizes missing data to []", () => {
  const env = parseEnvelope({ success: true, total: 3 });
  assertEquals(env.data, []);
});

// expectRejects: rejection assertion that avoids std's assertRejects (its
// `any` overloads trip Deno's no-explicit-any check).
async function expectRejects(promise: Promise<unknown>, pattern: string) {
  let caught: Error | null = null;
  try {
    await promise;
  } catch (err) {
    caught = err as Error;
  }
  if (caught === null) throw new Error("expected rejection");
  assertStrictEquals(caught.message.includes(pattern), true, caught.message);
}

Deno.test("parseEnvelope rejects a non-object body", () => {
  assertThrows(
    () => parseEnvelope("oops"),
    Error,
    "non-object",
  );
});

Deno.test("parseAsset validates identity and known item_type", () => {
  const parsed = parseAsset(asset());
  assertStrictEquals(parsed.code, "EQ-001");
  assertStrictEquals(parsed.id_type_item, 2);
  assertStrictEquals(parsed.available, true);
  assertStrictEquals(parsed.groups_1_description, null);
});

Deno.test("parseAsset lists an unknown item_type instead of coercing", () => {
  assertThrows(
    () => parseAsset(asset({ id_type_item: 99 })),
    Error,
    "unknown item_type 99",
  );
});

Deno.test("parseAsset rejects a row without identity", () => {
  assertThrows(
    () => parseAsset({ description: "x" }),
    Error,
    "identity",
  );
});

Deno.test("parsePage collects valid rows and lists malformed ones", () => {
  const { items, malformed } = parsePage({
    success: true,
    data: [asset(), { code: 4 }, asset({ active: "yes" })],
    total: 3,
  });
  assertEquals(items.length, 2);
  assertEquals(malformed.length, 1);
  assertEquals(malformed[0]?.reason, "asset missing identity (code/id)");
});

Deno.test("buildListQuery floors start and clamps limit to 100", () => {
  const q = buildListQuery({
    start: -5,
    limit: 999,
    itemType: 2,
    locationCode: "X",
    active: true,
  });
  assertEquals(q.get("start"), "0");
  assertEquals(q.get("limit"), "100");
  assertEquals(q.get("item_type"), "2");
  assertEquals(q.get("location_code"), "X");
  assertEquals(q.get("active"), "true");
  const clamped = buildListQuery({ limit: 0 });
  assertEquals(clamped.get("limit"), "1");
});

Deno.test("listAssets performs an authenticated GET and parses the page", async () => {
  const { fetchImpl, calls } = fakeFetch({
    "/items": { body: { success: true, data: [asset()], total: 1 } },
  });
  const client = createFracttalClient({
    baseUrl: DATA_URL,
    credentials: { key: "k", secret: "s" },
    fetchImpl,
  });
  const page = await client.listAssets({ itemType: 2 });
  assertEquals(page.items.length, 1);
  assertStrictEquals(page.total, 1);
  const call = calls.find((c) => c.url.includes("/items"));
  assertEquals(call?.init?.method, "GET");
  assertEquals(
    (call?.init?.headers as Record<string, string>).Authorization,
    "Bearer tok-1",
  );
  assertEquals(MAX_PAGE_SIZE, 100);
});

Deno.test("401 triggers one refresh then retries the data request", async () => {
  let itemHits = 0;
  let tokenGrants = 0;
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/token")) {
      tokenGrants++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "tok-after",
            refresh_token: "rt-1",
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    }
    itemHits++;
    // First data hit is stale-token 401; the retry succeeds.
    const success = itemHits > 1;
    return Promise.resolve(
      new Response(
        success ? JSON.stringify({ data: [asset()], total: 1 }) : "{}",
        {
          status: success ? 200 : 401,
        },
      ),
    );
  };
  const client = createFracttalClient({
    baseUrl: DATA_URL,
    credentials: { key: "k", secret: "s" },
    fetchImpl,
  });
  const page = await client.listAssets({});
  assertEquals(page.items.length, 1);
  assertEquals(itemHits, 2);
  assertEquals(tokenGrants, 2);
});

Deno.test("406 rate-limit pause waits reset header then retries", async () => {
  let hits = 0;
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "t",
            refresh_token: "r",
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    }
    hits++;
    return Promise.resolve(
      new Response(
        hits === 1 ? "{}" : JSON.stringify({ data: [asset()], total: 1 }),
        {
          status: hits === 1 ? 406 : 200,
          headers: hits === 1 ? { "ratelimit-reset": "2" } : undefined,
        },
      ),
    );
  };
  const client = createFracttalClient({
    baseUrl: DATA_URL,
    credentials: { key: "k", secret: "s" },
    maxRetries: 1,
    maxRateWaitMs: 5, // cap the 2s pause so the test stays fast
    fetchImpl,
  });
  const page = await client.listAssets({});
  assertEquals(page.items.length, 1);
  assertEquals(hits, 2);
});

Deno.test("collectAssets pages through total with malformed reporting", async () => {
  const rows = Array.from(
    { length: 3 },
    (_, i) => asset({ id: i + 1, code: `EQ-${i + 1}` }),
  );
  const client = makeClient({ "/items": { body: { data: rows, total: 3 } } });
  const { items, report } = await client.collectAssets({}, 2);
  assertEquals(items.length, 3);
  assertEquals(report.pagesFetched, 1);
  assertEquals(report.rawTotal, 3);
  assertEquals(report.collected, 3);
});

Deno.test("collectAssets surfaces malformed rows in the report", async () => {
  const client = makeClient({
    "/items": {
      body: { success: true, data: [asset(), { nope: true }], total: 2 },
    },
  });
  const { report } = await client.collectAssets({}, 1);
  assertEquals(report.malformed?.length, 1);
  assertEquals(report.collected, 1);
});

Deno.test("upstream 5xx throws after retries are exhausted", async () => {
  const fetchImpl = (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "t",
            refresh_token: "r",
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 503 }));
  };
  const client = createFracttalClient({
    baseUrl: DATA_URL,
    credentials: { key: "k", secret: "s" },
    maxRetries: 1,
    maxRateWaitMs: 5,
    fetchImpl,
  });
  await expectRejects(client.listAssets({}), "503");
});
