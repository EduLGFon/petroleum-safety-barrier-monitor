// Aurora Executive Dark header.
// This is why it exists: eyebrow + an extra-thin title on the left with
// a merged connection + sync bulb, a one-row sync subtitle (local instant
// plus colored delta chips), and a hover card with full run details.
// Gear button on the right. The header sits directly on the mesh canvas.
import {
  formatInstant,
  healthLabel,
  toHealthKind,
} from "../lib/sync-indicator.ts";

import type { AuthUser, SyncChange, SyncStatus } from "../lib/types.ts";

import { type Conn, useConnection } from "../hooks/useConnection.ts";

import { SyncDetailsModal } from "./header/SyncDetailsModal.tsx";

import { SyncHoverCard } from "./header/SyncHoverCard.tsx";

import { useEffect, useRef, useState } from "preact/hooks";

import { AURORA, AURORA_TYPE } from "../lib/aurora.ts";

import { HealthDot } from "./header/HealthDot.tsx";

import { SyncLine } from "./header/SyncLine.tsx";

interface Props {
  onOpenSettings: () => void;
  companyName?: string;
  // Base URL of the API origin. Empty = same origin as the page, so the
  // health probe defaults to the relative "/api/health".
  apiBaseUrl?: string;
  // Authenticated session identity (crossed from the server route). Shown
  // as email + role with a logout action; absent = menu hidden.
  sessionUser?: AuthUser | null;
  // Live sync status for the merged indicator (HTTP mode only). Null hides
  // the subtitle line and hover card; the dot falls back to connection only.
  syncStatus?: SyncStatus | null;
  // Barriers touched by recent sync runs for the card's "what changed"
  // section. Null hides the section (loading or mock mode).
  syncChanges?: SyncChange[] | null;
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

// Header: title + merged health dot plus sync subtitle on the left,
// settings gear on the right. Hovering or focusing the title block opens
// the summary card (touch toggles it with a tap); its button opens the
// full details dialog.
export function Header(
  {
    onOpenSettings,
    companyName = "",
    apiBaseUrl = "",
    sessionUser = null,
    syncStatus = null,
    syncChanges = null,
  }: Props,
) {
  const healthUrl = apiBaseUrl
    ? `${apiBaseUrl.replace(/\/$/, "")}/api/health`
    : "/api/health";
  const conn = useConnection(healthUrl);
  const [syncOpen, setSyncOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Hover intent: a short close delay forgives cursor slips off the title
  // or card edges, so reaching the details button never races the dismiss.
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = (): void => {
    if (closeTimer.current !== undefined) {
      globalThis.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  };
  useEffect(() => cancelClose, []);
  const openCard = (): void => {
    cancelClose();
    setSyncOpen(true);
  };
  const scheduleClose = (): void => {
    cancelClose();
    closeTimer.current = globalThis.setTimeout(() => setSyncOpen(false), 200);
  };
  // Opening the dialog dismisses the hover card so the two never stack.
  const openDetails = (): void => {
    setSyncOpen(false);
    setDetailsOpen(true);
  };
  const kind = toHealthKind(syncStatus, conn);
  const instantIso = syncStatus?.runningSince ??
    syncStatus?.lastRun?.finishedAt ?? null;
  const instant = formatInstant(instantIso);
  const dotLabel = syncStatus === null
    ? CONN_LABEL[conn]
    : `${CONN_LABEL[conn]} - ${healthLabel(kind)}${
      instant ? ` ${instant.dateTime}` : ""
    }`;
  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: "var(--d-section)",
          animation: "cardAppear .35s var(--ease-out) both",
          // Lifted above the dashboard sections below (slideUp entrances and
          // glass surfaces paint over the hover card otherwise). Stays below
          // the chart tooltip (2000) and all overlays (990+).
          position: "relative",
          zIndex: 30,
        }}
      >
        <div
          onMouseEnter={openCard}
          onMouseLeave={scheduleClose}
          onFocus={openCard}
          onBlur={(e) => {
            // Tabbing onto the details button moves focus inside the wrapper;
            // only a focus exit truly dismisses the card.
            const next = e.relatedTarget as unknown as Node | null;
            const host = e.currentTarget as unknown as HTMLDivElement;
            if (next !== null && host.contains(next)) return;
            scheduleClose();
          }}
          onClick={() => {
            cancelClose();
            setSyncOpen((v) => !v);
          }}
          tabIndex={syncStatus === null ? undefined : 0}
          style={{ position: "relative", outline: "none" }}
        >
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
            <HealthDot
              conn={conn}
              kind={syncStatus === null && conn === "connected"
                ? "synced"
                : kind}
              label={dotLabel}
            />
          </div>
          <SyncLine sync={syncStatus} conn={conn} />
          {syncOpen && syncStatus !== null && (
            <SyncHoverCard
              sync={syncStatus}
              conn={conn}
              onOpenDetails={openDetails}
            />
          )}
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
      {detailsOpen && syncStatus !== null && (
        <SyncDetailsModal
          sync={syncStatus}
          conn={conn}
          changes={syncChanges}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  );
}
