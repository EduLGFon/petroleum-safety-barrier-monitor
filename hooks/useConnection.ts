// useConnection - live server connectivity hook for the header dot.
// This is why it exists: Header mixed UI with heartbeat logic; extracting
// the hook keeps the component presentational and reusable elsewhere.
import { useEffect, useRef, useState } from "preact/hooks";

export type Conn = "connected" | "reconnecting" | "disconnected";

// Live server connectivity: browser online/offline events drive the dot,
// plus a lightweight heartbeat against /api/health so a stopped backend
// flips the dot to red even though the OS is still "online" (the old bug:
// navigator.onLine alone never notices the server going away). A fresh
// offline-to-online flip shows amber "reconnecting" briefly before settling
// on emerald, so all three states are reachable in production.
export function useConnection(
  healthUrl = "/api/health",
  intervalMs = 5000,
): Conn {
  const [conn, setConn] = useState<Conn>("connected");
  const connRef = useRef<Conn>("connected");
  const setLive = (next: Conn) => {
    connRef.current = next;
    setConn(next);
  };
  useEffect(() => {
    let cancelled = false;
    let settleTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let inFlight = false;

    const clearSettle = () => {
      if (settleTimer !== undefined) globalThis.clearTimeout(settleTimer);
      settleTimer = undefined;
    };
    // onServerOk: first success after an outage flashes amber before
    // settling on emerald; while already amber the pending settle wins.
    const onServerOk = () => {
      if (cancelled) return;
      if (connRef.current === "disconnected") {
        clearSettle();
        setLive("reconnecting");
        settleTimer = globalThis.setTimeout(() => {
          if (!cancelled) setLive("connected");
        }, 2500);
      } else if (connRef.current === "reconnecting") {
        if (settleTimer === undefined) {
          settleTimer = globalThis.setTimeout(() => {
            if (!cancelled) setLive("connected");
          }, 2500);
        }
      }
    };
    // onServerLost: drops to disconnected at once; clears any pending
    // reconnect timer.
    const onServerLost = () => {
      if (cancelled) return;
      clearSettle();
      if (connRef.current !== "disconnected") setLive("disconnected");
    };
    // ping: single heartbeat round; skips hidden tabs (a visibilitychange
    // fires an immediate re-check on return) and overlapping ticks.
    const ping = async () => {
      if (inFlight) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        onServerLost();
        return;
      }
      if (typeof document !== "undefined" && document.hidden) return;
      inFlight = true;
      const ctrl = new AbortController();
      const timeout = globalThis.setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(healthUrl, {
          method: "GET",
          cache: "no-store",
          headers: { "Accept": "application/json" },
          signal: ctrl.signal,
        });
        if (!res.ok) onServerLost();
        else onServerOk();
      } catch {
        // Network error / abort / server down: the dot must go red.
        onServerLost();
      } finally {
        globalThis.clearTimeout(timeout);
        inFlight = false;
      }
    };
    // onOffline: drops to disconnected at once; clears any pending reconnect timer.
    const onOffline = () => {
      onServerLost();
    };
    // onOnline: flashes reconnecting, then verifies the server before
    // claiming emerald (a captive portal can be "online" with the API dead).
    const onOnline = () => {
      if (cancelled) return;
      clearSettle();
      if (connRef.current !== "reconnecting") setLive("reconnecting");
      void ping();
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void ping();
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLive("disconnected");
    }
    void ping();
    const pollTimer = globalThis.setInterval(() => {
      void ping();
    }, intervalMs);
    globalThis.addEventListener("offline", onOffline);
    globalThis.addEventListener("online", onOnline);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      cancelled = true;
      clearSettle();
      globalThis.clearInterval(pollTimer);
      globalThis.removeEventListener("offline", onOffline);
      globalThis.removeEventListener("online", onOnline);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [healthUrl, intervalMs]);
  return conn;
}
