// Aurora Executive Dark header.
// This is why it exists: eyebrow + an extra-thin title on the left with
// a live connection dot (emerald = connected, amber = reconnecting,
// red = disconnected), gear button on the right. No cards, no pills, no
// extra chrome: the header sits directly on the mesh canvas.
import { type Conn, useConnection } from "../hooks/useConnection.ts";

import { AURORA, AURORA_CONN, AURORA_TYPE } from "../lib/aurora.ts";

import { useSettings } from "../context/SettingsContext.tsx";

import type { AuthUser } from "../lib/types.ts";

interface Props {
  onOpenSettings: () => void;
  companyName?: string;
  // Base URL of the API origin. Empty = same origin as the page, so the
  // health probe defaults to the relative "/api/health".
  apiBaseUrl?: string;
  // Authenticated session identity (crossed from the server route). Shown
  // as email + role with a logout action; absent = menu hidden.
  sessionUser?: AuthUser | null;
}

type ConnState = Conn;

const CONN_LABEL: Record<ConnState, string> = {
  connected: "Conectado",
  reconnecting: "Reconectando…",
  disconnected: "Desconectado",
};

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

// logoutToLogin: revokes the session cookie, then lands on /login.
// Failures still navigate (a dead session must never trap the user).
async function logoutToLogin(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Cookie may already be dead; navigation clears it anyway.
  }
  globalThis.location.href = "/login";
}

// Header: title + live connection dot on the left, settings gear on the right.
export function Header(
  { onOpenSettings, companyName = "", apiBaseUrl = "", sessionUser = null }:
    Props,
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
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {sessionUser && (
          <span
            className="glass-pill"
            title={sessionUser.email}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 6px 0 12px",
              height: 32,
              background: AURORA.pill,
              border: `1px solid ${AURORA.pillBorder}`,
              borderRadius: 99,
              color: AURORA.pillText,
              fontSize: 12,
              maxWidth: 260,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sessionUser.email}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                background: AURORA.grad,
                color: "#fff",
                borderRadius: 99,
                padding: "2px 8px",
                flexShrink: 0,
              }}
            >
              {sessionUser.role === "admin" ? "Admin" : "Usuário"}
            </span>
            <button
              type="button"
              onClick={() => void logoutToLogin()}
              title="Sair"
              style={{
                border: 0,
                background: "transparent",
                color: AURORA.pillText,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 6px",
                flexShrink: 0,
              }}
            >
              Sair
            </button>
          </span>
        )}
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
      </div>
    </header>
  );
}
