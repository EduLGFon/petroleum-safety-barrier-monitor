// useSyncChangeList - paged per-barrier sync change list (HTTP mode only).
// This is why it exists: the details modal lists last-run / last-day scopes
// with paging and filters, never loading all diffs at once. Snapshots stay
// server-side until a row expands (see useBarrierSyncDetail).
import type {
  SyncChangeItem,
  SyncChangeSummary,
  SyncRun,
} from "../../lib/types.ts";

import { useCallback, useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

export interface ChangeListQuery {
  scope: "last-run" | "last-day";
  runId?: number | null;
  kind?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface ChangeListResult {
  run: SyncRun | null;
  items: SyncChangeItem[];
  total: number;
  totalPages: number;
  summary: SyncChangeSummary;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useSyncChangeList(
  baseUrl: string,
  args: ChangeListQuery,
  enabled: boolean,
): ChangeListResult {
  const scope = args.scope;
  const runId = args.runId ?? null;
  const kind = args.kind ?? "all";
  const query = args.query ?? "";
  const page = args.page ?? 1;
  const pageSize = args.pageSize ?? 25;
  const [data, setData] = useState<
    Omit<ChangeListResult, "loading" | "error" | "retry">
  >({
    run: null,
    items: [],
    total: 0,
    totalPages: 1,
    summary: { total: 0, byKind: {}, byStatus: {}, critical: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !baseUrl) return;
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      scope,
      kind,
      query,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (runId !== null) params.set("runId", String(runId));
    fetch(`${baseUrl}/api/sync-changes?${params}`, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin",
      signal: ctrl.signal,
    }).then((res) => {
      if (res.status === 401 || res.status === 404) {
        toLoginWithReturn();
        return null;
      }
      if (!res.ok) throw new Error(`sync-changes ${res.status}`);
      return res.json() as Promise<ChangeListResult>;
    }).then((next) => {
      if (!next || cancelled) return;
      setData({
        run: next.run,
        items: Array.isArray(next.items) ? next.items : [],
        total: next.total ?? 0,
        totalPages: next.totalPages ?? 1,
        summary: next.summary ?? {
          total: 0,
          byKind: {},
          byStatus: {},
          critical: 0,
        },
      });
      setLoading(false);
    }).catch((err) => {
      if (
        cancelled || (err instanceof DOMException && err.name === "AbortError")
      ) return;
      setError(
        err instanceof Error ? err.message : "Falha ao carregar alterações",
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [baseUrl, enabled, scope, runId, kind, query, page, pageSize, nonce]);

  return { ...data, loading, error, retry };
}
