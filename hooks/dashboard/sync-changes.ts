// useSyncChanges - barriers touched by recent sync runs (HTTP mode only).
// This is why it exists: the hover card names what changed instead of only
// counting it. Same cadence discipline as the sync-status hook (hidden tabs
// skip, dead sessions redirect, failures are best-effort).
import type { SyncChange } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

export function useSyncChanges(
  baseUrl: string,
  refreshMs: number,
  enabled: boolean,
): SyncChange[] | null {
  const [changes, setChanges] = useState<SyncChange[] | null>(null);

  useEffect(() => {
    if (!enabled || !refreshMs || refreshMs <= 0 || !baseUrl) return;
    let cancelled = false;
    const load = (): void => {
      fetch(`${baseUrl}/api/sync-changes?limit=8`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      }).then((res) => {
        if (res.status === 401 || res.status === 404) {
          toLoginWithReturn();
          return;
        }
        if (!res.ok || cancelled) return;
        return res.json() as Promise<{ changes: SyncChange[] }>;
      }).then((next) => {
        if (next && !cancelled && Array.isArray(next.changes)) {
          setChanges(next.changes);
        }
      }).catch(() => {
        // Indicator refresh is best-effort; stale items simply persist.
      });
    };
    load();
    const onVisible = (): void => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, refreshMs);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    globalThis.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      globalThis.removeEventListener("focus", onVisible);
    };
  }, [baseUrl, refreshMs, enabled]);

  return changes;
}
