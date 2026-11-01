// useBarrierSyncDetail - one barrier's before/after diff, loaded on expand.
// This is why it exists: the list rows stay light; snapshots load only for
// the barrier the user actually opens. Cached per barrier+run in memory.
import type { SyncBarrierDetail } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

import { apiFetch } from "../../lib/api/http.ts";

const cache = new Map<string, { detail: SyncBarrierDetail; at: number }>();
const CACHE_MAX = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(key: string): SyncBarrierDetail | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // LRU touch: re-insert so eviction drops the oldest entry.
  cache.delete(key);
  cache.set(key, hit);
  return hit.detail;
}

function cacheSet(key: string, detail: SyncBarrierDetail): void {
  cache.delete(key);
  cache.set(key, { detail, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// clearBarrierDetailCache: called when a new sync run starts so rows never
// render a stale barrier snapshot from the previous run.
export function clearBarrierDetailCache(): void {
  cache.clear();
}

export function useBarrierSyncDetail(
  baseUrl: string,
  barrierId: number | null,
  opts: { runId?: number | null; scope?: "last-run" | "last-day" },
  enabled: boolean,
): {
  detail: SyncBarrierDetail | null;
  loading: boolean;
  error: string | null;
} {
  const runId = opts.runId ?? null;
  const scope = opts.scope ?? "last-run";
  const [detail, setDetail] = useState<SyncBarrierDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Empty baseUrl means same origin (relative /api/*), not disabled.
    if (!enabled || barrierId === null) {
      setDetail(null);
      setLoading(false);
      return;
    }
    const key = `${barrierId}:${runId ?? scope}`;
    const hit = cacheGet(key);
    if (hit) {
      setDetail(hit);
      setLoading(false);
      setError(null);
      return;
    }
    // New key: drop the previous barrier snapshot so the modal never shows
    // stale before/after while the next detail loads.
    setDetail(null);
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ scope });
    if (runId !== null) params.set("runId", String(runId));
    apiFetch(`${baseUrl}/api/barriers/${barrierId}/sync-detail?${params}`, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal,
    }).then((res) => {
      if (cancelled) return null;
      if (res.status === 401) {
        setError("Sessão expirada. Redirecionando para o acesso…");
        setLoading(false);
        toLoginWithReturn();
        return null;
      }
      if (res.status === 404) {
        setDetail(null);
        setError("Detalhe não encontrado para esta sincronização.");
        setLoading(false);
        return null;
      }
      if (!res.ok) throw new Error(`sync-detail ${res.status}`);
      return res.json() as Promise<{ detail: SyncBarrierDetail }>;
    }).then((next) => {
      if (cancelled) return;
      if (!next) {
        // 401/404 already settled loading/error above.
        setLoading(false);
        return;
      }
      cacheSet(key, next.detail);
      setDetail(next.detail);
      setLoading(false);
    }).catch((err) => {
      if (
        cancelled || (err instanceof DOMException && err.name === "AbortError")
      ) return;
      setError("Falha ao carregar detalhe");
      setLoading(false);
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [baseUrl, barrierId, runId, scope, enabled]);

  return { detail, loading, error };
}
