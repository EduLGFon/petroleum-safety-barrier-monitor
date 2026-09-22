// useSyncStatus - dashboard sync indicator data (HTTP mode only).
// This is why it exists: the pill needs the same cadence discipline as the
// vocabulary refresh (hidden tabs skip, dead sessions redirect, failures
// are best-effort) without tangling the data hook. Null while loading or
// when disabled; the pill renders nothing for null. While a run is in
// flight the hook switches to the fast activeMs lane so the flip back to
// synced lands seconds after the run, not one idle tick later. Returning
// to the tab or window refetches immediately for the same reason.
import type { SyncStatus } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

import { toLoginWithReturn } from "./server.ts";

export function useSyncStatus(
  baseUrl: string,
  idleMs: number,
  activeMs: number,
  enabled: boolean,
): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const active = status?.state === "syncing";

  useEffect(() => {
    if (!enabled || !baseUrl) return;
    const cadence = active ? activeMs : idleMs;
    if (!cadence || cadence <= 0) return;
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
    const onVisible = (): void => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, cadence);
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
  }, [baseUrl, idleMs, activeMs, enabled, active]);

  return status;
}
