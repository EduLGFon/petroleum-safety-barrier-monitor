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

// Creates an HTTP BarriersApi bound to the given backend baseUrl. labels
// carries dynamic station/category id->label maps so imported values beyond
// the seed enums still resolve for display.
export function httpAdapterFactory(
  baseUrl: string,
  labels?: ResolverLabels,
): BarriersApi {
  // GETs JSON path from baseUrl; throws on non-OK status.
  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin",
    });
    // 401 = dead session, 404 = camouflaged anonymous: both mean the caller
    // no longer has a session, so redirect to login rather than erroring.
    if (res.status === 401 || res.status === 404) {
      throw new AuthExpiredError(res.status, path);
    }
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
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
    // HTTP getBarrierById: fetches wire row by id; null only on 404,
    // other failures throw so callers can tell "missing" from "broken".
    // Note: a row-level 404 stays null (deleted barrier), while collection
    // 404s surface as AuthExpiredError via fetchJson and redirect to login.
    async getBarrierById(id) {
      const path = `/api/barriers/${id}`;
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      });
      if (res.status === 404) return null;
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
