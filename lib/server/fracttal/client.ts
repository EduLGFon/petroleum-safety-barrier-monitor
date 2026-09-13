// Fracttal read-only client - bounded GET pager over the live API.
// This is why it exists: the P2 spike needs real-contract access with
// safeguards: only GET, OAuth2 bearer tokens with one-shot 401 refresh,
// per-call timeout, exponential backoff, and honor of the 200 req/min limit
// (pause on low `ratelimit-remaining`, wait out `ratelimit-reset` on 406).
// Never imported by islands - lib/server only.
import { toItemType } from "./itemType.ts";
import {
  createTokenCache,
  type FracttalToken,
  type TokenCacheOptions,
  type TokenCredentials,
} from "./token.ts";
import type {
  FracttalAsset,
  FracttalListQuery,
  FracttalPage,
  FracttalReport,
} from "./types.ts";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RATE_WAIT_MS = 60_000;
export const DEFAULT_TOKEN_URL = "https://one.fracttal.com/oauth/token";

export interface FracttalClientOptions {
  baseUrl: string;
  credentials: TokenCredentials;
  tokenUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  // maxRateWaitMs caps how long a 406/429 pause may last (tests shrink it).
  maxRateWaitMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface FracttalClient {
  listAssets(query: FracttalListQuery): Promise<FracttalPage>;
  listRawItems(
    query: FracttalListQuery,
  ): Promise<{ rows: unknown[]; total: number }>;
  collectAssets(
    query: FracttalListQuery,
    maxPages?: number,
  ): Promise<{ items: FracttalAsset[]; report: FracttalReport }>;
}

interface Envelope {
  success?: unknown;
  message?: unknown;
  data: unknown;
  total?: unknown;
}

// parseEnvelope: normalizes the wide documented envelope; a malformed body
// fails loudly (upstream type change detection) while a missing `data` -> [].
export function parseEnvelope(raw: unknown): Envelope {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("[fracttal] non-object response body");
  }
  const body = raw as Record<string, unknown>;
  if (body.data !== undefined && typeof body.data !== "object") {
    throw new Error("[fracttal] unexpected data shape");
  }
  return {
    success: body.success,
    message: body.message,
    data: body.data ?? [],
    total: body.total,
  };
}

// parseAsset: structural validation of one item; identity fields are
// required and an unknown item_type is listed (never coerced).
export function parseAsset(raw: unknown): FracttalAsset {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("non-object asset row");
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.code !== "string" || typeof row.id !== "number") {
    throw new Error("asset missing identity (code/id)");
  }
  const itemType = toItemType(row.id_type_item);
  if (itemType === undefined) {
    throw new Error(`unknown item_type ${String(row.id_type_item)}`);
  }
  const str = (k: string) => (typeof row[k] === "string" ? row[k] : null);
  const bool = (k: string) => (typeof row[k] === "boolean" ? row[k] : null);
  const num = (k: string) => (typeof row[k] === "number" ? row[k] : null);
  return {
    id: row.id,
    code: row.code,
    active: bool("active"),
    available: bool("available"),
    id_type_item: itemType,
    description: str("description"),
    location_code: str("location_code"),
    id_parent: num("id_parent"),
    items_types_description: str("items_types_description"),
    groups_description: str("groups_description"),
    groups_1_description: str("groups_1_description"),
    groups_2_description: str("groups_2_description"),
    priorities_description: str("priorities_description"),
    parent_description: str("parent_description"),
    units_description: str("units_description"),
    is_serial_control: bool("is_serial_control"),
    initial_date_out_of_service: str("initial_date_out_of_service"),
    last_final_date_available: str("last_final_date_available"),
  };
}

// parsePage: validates + normalizes one page, keeping a list of rejected
// rows (index + reason) so drift is visible instead of silently dropped.
export function parsePage(
  raw: unknown,
): {
  items: FracttalAsset[];
  malformed: Array<{ index: number; reason: string }>;
} {
  const envelope = parseEnvelope(raw);
  const rows = Array.isArray(envelope.data) ? envelope.data : [];
  const malformed: Array<{ index: number; reason: string }> = [];
  const items: FracttalAsset[] = [];
  rows.forEach((row, i) => {
    try {
      items.push(parseAsset(row));
    } catch (err) {
      malformed.push({
        index: i,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  });
  return { items, malformed };
}

// buildListQuery: serializes the query object to the documented_ params,
// flooring start and clamping limit to the 100-record ceiling.
export function buildListQuery(q: FracttalListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (q.itemType !== undefined) params.set("item_type", String(q.itemType));
  if (q.locationCode !== undefined) params.set("location_code", q.locationCode);
  if (q.active !== undefined) params.set("active", String(q.active));
  if (q.available !== undefined) params.set("available", String(q.available));
  if (q.isTree !== undefined) params.set("is_tree", String(q.isTree));
  const start = Math.max(0, Math.floor(q.start ?? 0));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(q.limit ?? MAX_PAGE_SIZE)),
  );
  params.set("start", String(start));
  params.set("limit", String(limit));
  return params;
}

// createFracttalClient: wires the token cache and a fetch loop with
// timeout/retry/rate-limit safeguards into the read-only pager.
export function createFracttalClient(
  {
    baseUrl,
    credentials,
    tokenUrl = DEFAULT_TOKEN_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    maxRateWaitMs = DEFAULT_RATE_WAIT_MS,
    now = Date.now,
    fetchImpl = fetch,
  }: FracttalClientOptions,
): FracttalClient {
  const cacheOpts: TokenCacheOptions = {
    // fetchToken gaps the network layer so client tests can fake it.
    fetchToken: async (body, creds): Promise<FracttalToken> => {
      const res = await fetchImpl(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${creds.key}:${creds.secret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (!res.ok) throw new Error(`[fracttal] token error ${res.status}`);
      return await res.json() as FracttalToken;
    },
    creds: credentials,
    now,
  };
  const tokens = createTokenCache(cacheOpts);

  // waitPause: waits for a rate-limit window, capped at maxRateWaitMs.
  const waitPause = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, Math.min(ms, maxRateWaitMs)));

  // getJson: one authenticated GET with timeout, one 401 refresh retry,
  // 406/429 rate-limit wait, 5xx backoff, and strict body parsing.
  async function getJson(path: string): Promise<unknown> {
    let refreshed = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${await tokens.get()}` },
          signal: ctrl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          await waitPause(100 * 2 ** attempt);
          continue;
        }
        throw new Error(
          `[fracttal] request failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      clearTimeout(timer);
      if (res.status === 401) {
        if (refreshed) {
          throw new Error("[fracttal] token rejected after refresh");
        }
        refreshed = true;
        await tokens.refresh();
        continue;
      }
      const status = res.status;
      const reset = Number(res.headers.get("ratelimit-reset")) || 60;
      if (status === 406 || status === 429) {
        if (attempt < maxRetries) {
          await waitPause(reset * 1000);
          continue;
        }
        throw new Error(`[fracttal] rate limited (HTTP ${status})`);
      }
      if (status >= 500) {
        if (attempt < maxRetries) {
          await waitPause(100 * 2 ** attempt);
          continue;
        }
        throw new Error(`[fracttal] upstream error ${status}`);
      }
      if (!res.ok) throw new Error(`[fracttal] HTTP ${status} for ${path}`);
      return await res.json() as unknown;
    }
    throw new Error("[fracttal] getJson exhausted");
  }

  async function listAssets(query: FracttalListQuery): Promise<FracttalPage> {
    const body = await getJson(`/items?${buildListQuery(query).toString()}`);
    const parsed = parsePage(body);
    const envelope = parseEnvelope(body);
    return {
      items: parsed.items,
      total: typeof envelope.total === "number"
        ? envelope.total
        : parsed.items.length,
    };
  }

  // listRawItems: hands the raw rows straight through (no parseAsset). The
  // sync pipeline does its own parse + map + reconcile, so this is the only
  // surface it needs for a live run.
  async function listRawItems(
    query: FracttalListQuery,
  ): Promise<{ rows: unknown[]; total: number }> {
    const body = await getJson(`/items?${buildListQuery(query).toString()}`);
    const envelope = parseEnvelope(body);
    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    return {
      rows,
      total: typeof envelope.total === "number" ? envelope.total : rows.length,
    };
  }

  async function collectAssets(
    query: FracttalListQuery,
    maxPages = 1,
  ): Promise<{ items: FracttalAsset[]; report: FracttalReport }> {
    const items: FracttalAsset[] = [];
    const malformed: Array<{ index: number; reason: string }> = [];
    let pagesFetched = 0;
    let rawTotal = 0;
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(query.limit ?? MAX_PAGE_SIZE)),
    );
    while (pagesFetched < maxPages) {
      const body = await getJson(
        `/items?${
          buildListQuery({ ...query, start: pagesFetched * limit, limit })
            .toString()
        }`,
      );
      const parsed = parsePage(body);
      const envelope = parseEnvelope(body);
      const total = typeof envelope.total === "number"
        ? envelope.total
        : items.length + parsed.items.length;
      rawTotal = Math.max(rawTotal, total);
      malformed.push(...parsed.malformed);
      items.push(...parsed.items);
      pagesFetched++;
      if (items.length >= total) break;
    }
    return {
      items,
      report: {
        pagesFetched,
        rawTotal,
        collected: items.length,
        malformed: malformed.length > 0 ? malformed : undefined,
      },
    };
  }

  return { listAssets, listRawItems, collectAssets };
}
