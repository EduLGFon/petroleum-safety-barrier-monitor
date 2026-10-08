// HTTP API adapter - BarriersApi over fetch against routes/api/*.
// This is why it exists: the same wire format (numeric ids) the mock uses,
// so switching PUBLIC_API_MODE needs no consumer changes. Null means 404;
// other failures throw so callers tell "missing" from "broken". Session
// cookies ride along (same-origin); 401/404 from data endpoints throw
// AuthExpiredError so the dashboard returns to /login instead of stranding.
import type {
  BarriersResponse,
  WireBarrier,
  WireCategoryCompliance,
  WireKpiSnapshot,
} from "../wireTypes.ts";

import { resolveBarriers, resolveChartData, resolveKpi } from "../resolve.ts";

import type { ResolverLabels } from "../resolve.ts";

import { buildQueryString } from "./query.ts";

import type { BarriersApi } from "./types.ts";

// AuthExpiredError: the session died (or never existed) mid-use. The
// dashboard catches this to redirect to /login?next=; anything else is a
// genuine failure surfaced by ServerError.
export class AuthExpiredError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`Session expired (${status}): ${path}`);
    this.name = "AuthExpiredError";
    this.status = status;
  }
}

// isAuthExpired: narrows unknown throwables to session-expiry redirects.
export function isAuthExpired(err: unknown): boolean {
  return err instanceof AuthExpiredError;
}

// Revalidation cache size: last ETag-tagged bodies per URL, so unchanged
// polls answer from memory after a 304 instead of re-downloading and
// re-parsing. Dashboard filter combinations are small; entries refresh on
// every 200 and drop when the server stops tagging.
const MAX_CACHED_URLS = 50;

// Creates an HTTP BarriersApi bound to the given backend baseUrl. labels
// carries dynamic station/category id->label maps so imported values beyond
// the seed enums still resolve for display.
export function httpAdapterFactory(
  baseUrl: string,
  labels?: ResolverLabels,
): BarriersApi {
  // Per-adapter URL cache (never shared: different baseUrls must never
  // serve each other's bytes).
  const etagCache = new Map<string, { etag: string; body: unknown }>();
  // GETs JSON path from baseUrl; throws on non-OK status.
  async function fetchJson<T>(path: string): Promise<T> {
    const cached = etagCache.get(path);
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        "Accept": "application/json",
        ...(cached ? { "If-None-Match": cached.etag } : {}),
      },
      credentials: "same-origin",
    });
    // 304 confirms the cached bytes are current - return them without
    // re-parsing. Untagged 304s (no cache entry) are an error: the server
    // only confirms tags it issued.
    if (res.status === 304) {
      if (cached) return cached.body as T;
      throw new Error(`API error ${res.status}: ${path}`);
    }
    // 401 = dead session, 404 = camouflaged anonymous on collections
    // (collection reads never 404 for missing data - they return empty
    // pages - so any 404 here means the caller has no session). Both
    // redirect to login rather than erroring. 403 (authenticated but
    // forbidden, e.g. non-admin asking for deleted scope) and 503/500 fall
    // through to the generic error below so the UI shows retry instead.
    if (res.status === 401 || res.status === 404) {
      throw new AuthExpiredError(res.status, path);
    }
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    const body = await res.json() as T;
    const etag = res.headers.get("etag");
    if (etag) {
      if (etagCache.size >= MAX_CACHED_URLS && !etagCache.has(path)) {
        const oldest = etagCache.keys().next();
        if (!oldest.done) etagCache.delete(oldest.value);
      }
      etagCache.set(path, { etag, body });
    } else {
      etagCache.delete(path);
    }
    return body;
  }

  return {
    // HTTP getBarriers: fetches one wire page and resolves items to domain.
    async getBarriers(query) {
      const qs = buildQueryString(query);
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return {
        items: resolveBarriers(data.items, labels),
        total: data.total,
        totalPages: data.totalPages,
      };
    },
    // HTTP getAllBarriers: fetches up to 100k wire rows, resolves to domain.
    async getAllBarriers(query) {
      const qs = buildQueryString({ ...query, page: 1, pageSize: 100000 });
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return resolveBarriers(data.items, labels);
    },
    // HTTP getBarrierById: fetches wire row by id; null only on a genuine
    // row-level 404 ("Barrier not found"), other failures throw so callers
    // can tell "missing" from "broken". Anonymous camouflage (envelope error
    // exactly "not found") throws AuthExpiredError like the collections so
    // logged-out callers redirect to login instead of seeing a null row.
    async getBarrierById(id) {
      const path = `/api/barriers/${id}`;
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 404) {
        let camouflaged = false;
        try {
          const data = await res.clone().json() as { error?: unknown };
          camouflaged = data.error === "not found";
        } catch {
          // Non-JSON 404 (proxy/CDN): treat as a missing row, not expiry.
        }
        if (camouflaged) throw new AuthExpiredError(404, path);
        return null;
      }
      if (res.status === 401) throw new AuthExpiredError(401, path);
      if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
      const w = await res.json() as WireBarrier;
      return resolveBarriers([w], labels)[0];
    },
    // HTTP getKpi: fetches wire KPI snapshot and resolves to domain.
    async getKpi(query) {
      const qs = buildQueryString(query);
      const w = await fetchJson<WireKpiSnapshot>(`/api/kpi?${qs}`);
      return resolveKpi(w);
    },
    // HTTP getChartData: fetches wire per-category totals and resolves rows.
    async getChartData(query) {
      const qs = buildQueryString(query);
      const items = await fetchJson<WireCategoryCompliance[]>(
        `/api/chart?${qs}`,
      );
      return resolveChartData(items, labels);
    },
  };
}
