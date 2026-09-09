/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNIFIED API CLIENT — single entry point that feeds the entire dashboard
 * ══════════════════════════════════════════════════════════════════════════
 * Every component reads data exclusively through this module. Two adapters
 * implement the same `BarriersApi` contract:
 *
 *   - `mockAdapter`  — deterministic in-memory data (lib/data.ts). Filters
 *                      operate on the raw WireBarrier[] using numeric ids,
 *                      exactly like a real SQL WHERE clause would, then
 *                      resolves only the final page to domain objects.
 *   - `httpAdapter`  — talks to a real REST backend using the wire format
 *                      defined in lib/wireTypes.ts (numeric ids everywhere).
 *
 * Active adapter is controlled by `PUBLIC_API_MODE`:
 *   - "mock" (default) -> mockAdapter
 *   - "http"            -> httpAdapter, using PUBLIC_API_BASE_URL
 *
 * To go live: set PUBLIC_API_MODE=http and PUBLIC_API_BASE_URL to
 * your backend root. No other file in the app needs to change — every
 * consumer calls `api.*` exclusively.
 */

import {
  fromLocationId,
  toCategoriaId,
  toConformidadeId,
  toDisponibilidadeId,
  toLocationId,
} from "./enums.ts";
import type {
  BarriersQuery,
  BarriersResponse,
  WireBarrier,
  WireKpiSnapshot,
} from "./wireTypes.ts";
import { resolveBarriers, resolveKpi } from "./resolve.ts";
import { computeKpi as computeKpiLocal } from "./utils.ts";
import type { Barrier, KpiSnapshot } from "./types.ts";
import { getWireBarriers } from "./data.ts";

// ─── Public contract ──────────────────────────────────────────────────────

export interface BarriersApi {
  /** Fetch a page of barriers matching the given (already id-encoded) query */
  getBarriers(
    query: BarriersQuery,
  ): Promise<{ items: Barrier[]; total: number; totalPages: number }>;
  /** Fetch every barrier matching the query, unpaginated (used for export & KPI/chart calc) */
  getAllBarriers(
    query: Omit<BarriersQuery, "page" | "pageSize">,
  ): Promise<Barrier[]>;
  /** Fetch a single barrier by id */
  getBarrierById(id: number): Promise<Barrier | null>;
  /** Fetch a precomputed KPI snapshot for the given scope */
  getKpi(query: Pick<BarriersQuery, "locationId">): Promise<KpiSnapshot>;
}

// ─── Domain <-> wire query conversion ─────────────────────────────────────

export interface DomainQuery {
  location?: string; // e.g. 'FAL' | 'ALL'
  disponibilidade?: string; // display string or ''
  conformidade?: string;
  categoria?: string;
  query?: string;
  // Inclusive ISO-date bounds (YYYY-MM-DD) on statusSince.
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  sortCol?: string;
  sortDir?: "asc" | "desc";
}

// Accepts YYYY-MM-DD (or longer ISO starting with a valid date); else undefined.
function cleanDateParam(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const date = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

/** Converts UI-facing string filters into the numeric wire query the API expects.
 *  Unknown vocabulary values are skipped (with a warning) instead of silently
 *  mapping to a wrong known id — the server will learn the new value first. */
export function toWireQuery(f: DomainQuery): BarriersQuery {
  const q: BarriersQuery = {};
  if (f.location && f.location !== "ALL") {
    const id = toLocationId(f.location);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown location: ${f.location}`);
    } else q.locationId = id;
  }
  if (f.disponibilidade) {
    const id = toDisponibilidadeId(f.disponibilidade as never);
    if (id === undefined) {
      console.warn(
        `[toWireQuery] unknown disponibilidade: ${f.disponibilidade}`,
      );
    } else q.disponibilidadeId = id;
  }
  if (f.conformidade) {
    const id = toConformidadeId(f.conformidade as never);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown conformidade: ${f.conformidade}`);
    } else q.conformidadeId = id;
  }
  if (f.categoria) {
    const id = toCategoriaId(f.categoria);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown categoria: ${f.categoria}`);
    } else q.categoriaId = id;
  }
  if (f.query) q.query = f.query;
  const since = cleanDateParam(f.since);
  if (since) q.since = since;
  const until = cleanDateParam(f.until);
  if (until) q.until = until;
  if (f.page) q.page = f.page;
  if (f.pageSize) q.pageSize = f.pageSize;
  if (f.sortCol) q.sortCol = f.sortCol;
  if (f.sortDir) q.sortDir = f.sortDir;
  return q;
}

// ─── Mock adapter — filters raw WireBarrier[] by numeric id, like a real DB ──

const CONFORME_STATUS_IDS = new Set([0, 1, 2, 3]); // Disponível, Fora de Op., Ind.Cont., Degr.Cont.

// Derives conformidade id (0 Conforme / 1 Não Conforme) from disponibilidade id.
function wireConformidadeId(dispId: number): number {
  return CONFORME_STATUS_IDS.has(dispId) ? 0 : 1; // 0=Conforme 1=Não Conforme
}

// Checks a wire barrier against numeric query filters (mock WHERE clause).
function matchesQuery(w: WireBarrier, q: BarriersQuery): boolean {
  if (
    q.locationId !== undefined && q.locationId !== 0 &&
    w.locationId !== q.locationId
  ) return false;
  if (
    q.disponibilidadeId !== undefined &&
    w.disponibilidadeId !== q.disponibilidadeId
  ) return false;
  if (
    q.conformidadeId !== undefined &&
    wireConformidadeId(w.disponibilidadeId) !== q.conformidadeId
  ) return false;
  if (q.categoriaId !== undefined && w.categoriaId !== q.categoriaId) {
    return false;
  }
  if (q.query) {
    const s = q.query.toLowerCase();
    const locCode = fromLocationId(w.locationId).toLowerCase();
    if (!(w.tag.toLowerCase().includes(s) || locCode.includes(s))) return false;
  }
  // ISO dates compare lexicographically; statusSince is YYYY-MM-DD.
  if (q.since && w.statusSince < q.since) return false;
  if (q.until && w.statusSince > q.until) return false;
  return true;
}

// Sorts wire barriers in-memory by SortableColumn and direction.
function sortWire(
  items: WireBarrier[],
  sortCol: string,
  sortDir: "asc" | "desc",
): WireBarrier[] {
  const dir = sortDir === "asc" ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    switch (sortCol) {
      case "id":
        return (a.id - b.id) * dir;
      case "tag":
        return a.tag.localeCompare(b.tag, "pt-BR") * dir;
      case "criticidade":
        return (a.criticidadeId - b.criticidadeId) * dir;
      case "categoria":
        return (a.categoriaId - b.categoriaId) * dir;
      case "disponibilidade":
        return (a.disponibilidadeId - b.disponibilidadeId) * dir;
      case "conformidade":
        return (wireConformidadeId(a.disponibilidadeId) -
          wireConformidadeId(b.disponibilidadeId)) * dir;
      case "statusSince":
        return a.statusSince.localeCompare(b.statusSince) * dir;
      default:
        return 0;
    }
  });
  return sorted;
}

const mockAdapter: BarriersApi = {
  // Mock getBarriers: filters, sorts, paginates, resolves page to domain.
  getBarriers(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    const total = all.length;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sorted = sortWire(all, query.sortCol ?? "id", query.sortDir ?? "asc");
    const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);
    return Promise.resolve({
      items: resolveBarriers(pageItems),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  },

  // Mock getAllBarriers: filters/sorts all matches for export/KPI use.
  getAllBarriers(query) {
    const all = getWireBarriers().filter((w) => matchesQuery(w, query));
    const sorted = sortWire(all, query.sortCol ?? "id", query.sortDir ?? "asc");
    return Promise.resolve(resolveBarriers(sorted));
  },

  // Mock getBarrierById: finds wire row by id, resolves to domain.
  getBarrierById(id) {
    const w = getWireBarriers().find((b) => b.id === id);
    return Promise.resolve(w ? resolveBarriers([w])[0] : null);
  },

  // Mock getKpi: filters by location and computes local KPI snapshot.
  getKpi(query) {
    const all = getWireBarriers().filter((w) =>
      query.locationId === undefined || query.locationId === 0 ||
      w.locationId === query.locationId
    );
    return Promise.resolve({
      ...computeKpiLocal(resolveBarriers(all)),
      syncedAt: new Date().toISOString(),
    });
  },
};

// ─── HTTP adapter — talks to a real backend using the wire format ────────

// Serializes wire query to URL search string, skipping empty values.
function buildQueryString(q: BarriersQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return params.toString();
}

// Creates an HTTP BarriersApi bound to the given backend baseUrl.
function httpAdapterFactory(baseUrl: string): BarriersApi {
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

// ─── Adapter selection ────────────────────────────────────────────────────

// Reads env on the server via Deno. On the client (island) Deno is absent,
// so this falls back to undefined and the mock adapter is used by default.
function getEnv(key: string): string | undefined {
  try {
    if (typeof Deno !== "undefined") return Deno.env.get(key);
  } catch {
    // --deny-env or non-Deno runtime: fall through to default.
  }
  return undefined;
}

const API_MODE = (getEnv("PUBLIC_API_MODE") ?? "mock") as
  | "mock"
  | "http";
const API_BASE_URL = getEnv("PUBLIC_API_BASE_URL") ?? "";

export const api: BarriersApi = API_MODE === "http" && API_BASE_URL
  ? httpAdapterFactory(API_BASE_URL)
  : mockAdapter;

/** Always the in-memory mock, regardless of API_MODE — useful for tests/debugging */
export const mockApi = mockAdapter;
