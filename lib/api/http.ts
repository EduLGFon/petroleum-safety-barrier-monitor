// HTTP API adapter - BarriersApi over fetch against routes/api/*.
// This is why it exists: the same wire format (numeric ids) the mock uses,
// so switching PUBLIC_API_MODE needs no consumer changes. Null means 404;
// other failures throw so callers tell "missing" from "broken".
import type {
  BarriersQuery,
  BarriersResponse,
  WireBarrier,
  WireKpiSnapshot,
} from "../wireTypes.ts";
import { resolveBarriers, resolveKpi } from "../resolve.ts";
import { buildQueryString } from "./query.ts";
import type { BarriersApi } from "./types.ts";

// Creates an HTTP BarriersApi bound to the given backend baseUrl.
export function httpAdapterFactory(baseUrl: string): BarriersApi {
  // GETs JSON path from baseUrl; throws on non-OK status.
  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  return {
    // HTTP getBarriers: fetches one wire page and resolves items to domain.
    async getBarriers(query) {
      const qs = buildQueryString(query);
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return {
        items: resolveBarriers(data.items),
        total: data.total,
        totalPages: data.totalPages,
      };
    },
    // HTTP getAllBarriers: fetches up to 100k wire rows, resolves to domain.
    async getAllBarriers(query) {
      const qs = buildQueryString({ ...query, page: 1, pageSize: 100000 });
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return resolveBarriers(data.items);
    },
    // HTTP getBarrierById: fetches wire row by id; null only on 404,
    // other failures throw so callers can tell "missing" from "broken".
    async getBarrierById(id) {
      const path = `/api/barriers/${id}`;
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { "Accept": "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
      const w = await res.json() as WireBarrier;
      return resolveBarriers([w])[0];
    },
    // HTTP getKpi: fetches wire KPI snapshot and resolves to domain.
    async getKpi(query) {
      const qs = buildQueryString(query);
      const w = await fetchJson<WireKpiSnapshot>(`/api/kpi?${qs}`);
      return resolveKpi(w);
    },
  };
}
