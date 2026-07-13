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
 * Active adapter is controlled by `NEXT_PUBLIC_API_MODE`:
 *   - "mock" (default) -> mockAdapter
 *   - "http"            -> httpAdapter, using NEXT_PUBLIC_API_BASE_URL
 *
 * To go live: set NEXT_PUBLIC_API_MODE=http and NEXT_PUBLIC_API_BASE_URL to
 * your backend root. No other file in the app needs to change — every
 * consumer calls `api.*` exclusively.
 */

import type { Barrier, KpiSnapshot } from './types';
import type { WireBarrier, BarriersQuery, BarriersResponse, WireKpiSnapshot } from './wireTypes';
import { resolveBarriers, resolveKpi } from './resolve';
import { getWireBarriers } from './data';
import {
  toLocationId, toDisponibilidadeId, toConformidadeId, toCategoriaId,
  fromLocationId,
} from './enums';
import { computeKpi as computeKpiLocal } from './utils';

// ─── Public contract ──────────────────────────────────────────────────────

export interface BarriersApi {
  /** Fetch a page of barriers matching the given (already id-encoded) query */
  getBarriers(query: BarriersQuery): Promise<{ items: Barrier[]; total: number; totalPages: number }>;
  /** Fetch every barrier matching the query, unpaginated (used for export & KPI/chart calc) */
  getAllBarriers(query: Omit<BarriersQuery,'page'|'pageSize'>): Promise<Barrier[]>;
  /** Fetch a single barrier by id */
  getBarrierById(id: number): Promise<Barrier | null>;
  /** Fetch a precomputed KPI snapshot for the given scope */
  getKpi(query: Pick<BarriersQuery,'locationId'>): Promise<KpiSnapshot>;
}

// ─── Domain <-> wire query conversion ─────────────────────────────────────

export interface DomainQuery {
  location?:        string;  // e.g. 'FAL' | 'ALL'
  disponibilidade?: string;  // display string or ''
  conformidade?:    string;
  categoria?:       string;
  query?:           string;
  page?:            number;
  pageSize?:        number;
  sortCol?:         string;
  sortDir?:         'asc' | 'desc';
}

/** Converts UI-facing string filters into the numeric wire query the API expects */
export function toWireQuery(f: DomainQuery): BarriersQuery {
  const q: BarriersQuery = {};
  if (f.location && f.location !== 'ALL')  q.locationId        = toLocationId(f.location);
  if (f.disponibilidade)                    q.disponibilidadeId = toDisponibilidadeId(f.disponibilidade as never);
  if (f.conformidade)                       q.conformidadeId    = toConformidadeId(f.conformidade as never);
  if (f.categoria)                          q.categoriaId       = toCategoriaId(f.categoria);
  if (f.query)                              q.query             = f.query;
  if (f.page)                               q.page              = f.page;
  if (f.pageSize)                           q.pageSize          = f.pageSize;
  if (f.sortCol)                            q.sortCol           = f.sortCol;
  if (f.sortDir)                            q.sortDir           = f.sortDir;
  return q;
}

// ─── Mock adapter — filters raw WireBarrier[] by numeric id, like a real DB ──

const CONFORME_STATUS_IDS = new Set([0, 1, 2, 3]); // Disponível, Fora de Op., Ind.Cont., Degr.Cont.

function wireConformidadeId(dispId: number): number {
  return CONFORME_STATUS_IDS.has(dispId) ? 0 : 1; // 0=Conforme 1=Não Conforme
}

function matchesQuery(w: WireBarrier, q: BarriersQuery): boolean {
  if (q.locationId !== undefined && q.locationId !== 0 && w.locationId !== q.locationId) return false;
  if (q.disponibilidadeId !== undefined && w.disponibilidadeId !== q.disponibilidadeId) return false;
  if (q.conformidadeId !== undefined && wireConformidadeId(w.disponibilidadeId) !== q.conformidadeId) return false;
  if (q.categoriaId !== undefined && w.categoriaId !== q.categoriaId) return false;
  if (q.query) {
    const s = q.query.toLowerCase();
    const locCode = fromLocationId(w.locationId).toLowerCase();
    if (!(w.tag.toLowerCase().includes(s) || locCode.includes(s))) return false;
  }
  return true;
}

function sortWire(items: WireBarrier[], sortCol: string, sortDir: 'asc'|'desc'): WireBarrier[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...items].sort((a, b) => {
    switch (sortCol) {
      case 'id':              return (a.id - b.id) * dir;
      case 'tag':              return a.tag.localeCompare(b.tag, 'pt-BR') * dir;
      case 'criticidade':      return (a.criticidadeId - b.criticidadeId) * dir;
      case 'categoria':        return (a.categoriaId - b.categoriaId) * dir;
      case 'disponibilidade':  return (a.disponibilidadeId - b.disponibilidadeId) * dir;
      case 'conformidade':     return (wireConformidadeId(a.disponibilidadeId) - wireConformidadeId(b.disponibilidadeId)) * dir;
      case 'statusSince':      return a.statusSince.localeCompare(b.statusSince) * dir;
      default:                 return 0;
    }
  });
  return sorted;
}

const mockAdapter: BarriersApi = {
  async getBarriers(query) {
    const all = getWireBarriers().filter(w => matchesQuery(w, query));
    const total     = all.length;
    const page      = query.page ?? 1;
    const pageSize  = query.pageSize ?? 25;
    const sorted    = sortWire(all, query.sortCol ?? 'id', query.sortDir ?? 'asc');
    const pageItems = sorted.slice((page-1)*pageSize, page*pageSize);
    return {
      items: resolveBarriers(pageItems),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  async getAllBarriers(query) {
    const all    = getWireBarriers().filter(w => matchesQuery(w, query));
    const sorted = sortWire(all, query.sortCol ?? 'id', query.sortDir ?? 'asc');
    return resolveBarriers(sorted);
  },

  async getBarrierById(id) {
    const w = getWireBarriers().find(b => b.id === id);
    return w ? resolveBarriers([w])[0] : null;
  },

  async getKpi(query) {
    const all = getWireBarriers().filter(w =>
      query.locationId === undefined || query.locationId === 0 || w.locationId === query.locationId
    );
    return computeKpiLocal(resolveBarriers(all));
  },
};

// ─── HTTP adapter — talks to a real backend using the wire format ────────

function buildQueryString(q: BarriersQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return params.toString();
}

function httpAdapterFactory(baseUrl: string): BarriersApi {
  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  return {
    async getBarriers(query) {
      const qs = buildQueryString(query);
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return { items: resolveBarriers(data.items), total: data.total, totalPages: data.totalPages };
    },
    async getAllBarriers(query) {
      const qs = buildQueryString({ ...query, page: 1, pageSize: 100000 });
      const data = await fetchJson<BarriersResponse>(`/api/barriers?${qs}`);
      return resolveBarriers(data.items);
    },
    async getBarrierById(id) {
      try {
        const w = await fetchJson<WireBarrier>(`/api/barriers/${id}`);
        return resolveBarriers([w])[0];
      } catch { return null; }
    },
    async getKpi(query) {
      const qs = buildQueryString(query);
      const w = await fetchJson<WireKpiSnapshot>(`/api/kpi?${qs}`);
      return resolveKpi(w);
    },
  };
}

// ─── Adapter selection ────────────────────────────────────────────────────

const API_MODE     = (process.env.NEXT_PUBLIC_API_MODE ?? 'mock') as 'mock' | 'http';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export const api: BarriersApi =
  API_MODE === 'http' && API_BASE_URL ? httpAdapterFactory(API_BASE_URL) : mockAdapter;

/** Always the in-memory mock, regardless of API_MODE — useful for tests/debugging */
export const mockApi = mockAdapter;
