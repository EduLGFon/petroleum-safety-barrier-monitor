// Aurora Executive Dark header.
// This is why it exists: eyebrow + an extra-thin title on the left with
// a live connection dot (emerald = connected, amber = reconnecting,
// red = disconnected), gear button on the right. No cards, no pills, no
// extra chrome: the header sits directly on the mesh canvas.
import { AURORA, AURORA_CONN, AURORA_TYPE } from "../lib/aurora.ts";
import { useSettings } from "../context/SettingsContext.tsx";
import { useEffect, useRef, useState } from "preact/hooks";

interface Props {
  onOpenSettings: () => void;
  companyName?: string;
  // Base URL of the API origin. Empty = same origin as the page, so the
  // health probe defaults to the relative "/api/health".
  apiBaseUrl?: string;
}

type Conn = "connected" | "reconnecting" | "disconnected";

const CONN_LABEL: Record<Conn, string> = {
  connected: "Conectado",
  reconnecting: "Reconectando…",
  disconnected: "Desconectado",
};

// Live server connectivity: browser online/offline events drive the dot,
// plus a lightweight heartbeat against /api/health so a stopped backend
// flips the dot to red even though the OS is still "online" (the old bug:
// navigator.onLine alone never notices the server going away). A fresh
// offline→online flip shows amber "reconnecting" briefly before settling
// on emerald, so all three states are reachable in production.
function useConnection(healthUrl = "/api/health", intervalMs = 5000): Conn {
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

// GearIcon: 14px settings gear glyph for the header button.
function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

// Header: title + live connection dot on the left, settings gear on the right.
export function Header(
  { onOpenSettings, companyName = "", apiBaseUrl = "" }: Props,
) {
  const healthUrl = apiBaseUrl
    ? `${apiBaseUrl.replace(/\/$/, "")}/api/health`
    : "/api/health";
  const conn = useConnection(healthUrl);
  const { settings } = useSettings();
  const isUp = conn === "connected";
  // Connected: the palette's main color. Offline: red - or gray when the
  // palette itself is red, so the two states never look alike.
  const color = isUp
    ? AURORA_CONN.connected
    : settings.accentColor === "red"
    ? AURORA_CONN.offlineOnRed
    : AURORA_CONN.offline;
  const glow = isUp ? AURORA_CONN.connectedGlow : color;
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: "var(--d-section)",
        animation: "cardAppear .35s var(--ease-out) both",
      }}
    >
      <div>
        {companyName && (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: AURORA_TYPE.eyebrow.fontSize,
              letterSpacing: AURORA_TYPE.eyebrow.letterSpacing,
              fontWeight: AURORA_TYPE.eyebrow.fontWeight,
              color: AURORA.eyebrow,
            }}
          >
            {companyName.toUpperCase()}
          </div>
        )}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: AURORA_TYPE.hero.fontSize,
            fontWeight: AURORA_TYPE.hero.fontWeight,
            letterSpacing: AURORA_TYPE.hero.letterSpacing,
            color: AURORA.value,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          Monitor de Barreiras
          <span
            title={CONN_LABEL[conn]}
            aria-label={CONN_LABEL[conn]}
            style={{
              width: 12,
              height: 12,
              borderRadius: 99,
              flexShrink: 0,
              // Solid bulb in the live color + three-layer halo.
              // Lit states breathe/flicker, the dead state holds still.
              background: color,
              boxShadow:
                `0 0 3px ${color}, 0 0 10px ${glow}, 0 0 22px color-mix(in srgb, ${color} 35%, transparent)`,
              animation: conn === "connected"
                ? "bulbBreathe 3.5s ease-in-out infinite"
                : conn === "reconnecting"
                ? "bulbFlicker 1.6s linear infinite"
                : "none",
            }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="glass-pill lift"
        title="Configurações"
        aria-label="Configurações"
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: AURORA.pill,
          border: `1px solid ${AURORA.pillBorder}`,
          borderRadius: 99,
          color: AURORA.pillText,
          cursor: "pointer",
        }}
      >
        <GearIcon />
      </button>
    </header>
  );
}
