// useBarrierSyncDetail - one barrier's before/after diff, loaded on expand.
// This is why it exists: the list rows stay light; snapshots load only for
// the barrier the user actually opens. Cached per barrier+run in memory.
import type { SyncBarrierDetail } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

const cache = new Map<string, SyncBarrierDetail>();

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
    if (!enabled || !baseUrl || barrierId === null) return;
    const key = `${barrierId}:${runId ?? scope}`;
    const hit = cache.get(key);
    if (hit) {
      setDetail(hit);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ scope });
    if (runId !== null) params.set("runId", String(runId));
    fetch(`${baseUrl}/api/barriers/${barrierId}/sync-detail?${params}`, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal,
    }).then((res) => {
      if (res.status === 401 || res.status === 404) {
        if (res.status === 401) toLoginWithReturn();
        return null;
      }
      if (!res.ok) throw new Error(`sync-detail ${res.status}`);
      return res.json() as Promise<{ detail: SyncBarrierDetail }>;
    }).then((next) => {
      if (!next || cancelled) return;
      cache.set(key, next.detail);
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
