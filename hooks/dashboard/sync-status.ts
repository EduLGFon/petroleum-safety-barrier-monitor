// useSyncStatus - dashboard sync indicator data (HTTP mode only).
// This is why it exists: the pill needs the same cadence discipline as the
// vocabulary refresh (hidden tabs skip, dead sessions redirect, failures
// are best-effort) without tangling the data hook. Null while loading or
// when disabled; the pill renders nothing for null.
import type { SyncStatus } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

export function useSyncStatus(
  baseUrl: string,
  refreshMs: number,
  enabled: boolean,
): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!enabled || !refreshMs || refreshMs <= 0 || !baseUrl) return;
    let cancelled = false;
    const load = (): void => {
      fetch(`${baseUrl}/api/sync-status`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
      }).then((res) => {
        if (res.status === 401 || res.status === 404) {
          toLoginWithReturn();
          return;
        }
        if (!res.ok || cancelled) return;
        return res.json() as Promise<SyncStatus>;
      }).then((next) => {
        if (next && !cancelled) setStatus(next);
      }).catch(() => {
        // Indicator refresh is best-effort; stale status simply persists.
      });
    };
    load();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [baseUrl, refreshMs, enabled]);

  return status;
}
