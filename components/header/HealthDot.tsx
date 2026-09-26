// HealthDot - merged connection + sync bulb for the header title.
// This is why it exists: one glyph replaces the old lone connection dot
// and the separate sync pill. Core fill carries sync state, the halo
// carries connection state, so both dimensions read at a glance.
import type { HealthKind } from "../../lib/sync-indicator.ts";

import type { Conn } from "../../hooks/useConnection.ts";

import { SYNC_DOT } from "../../lib/sync-indicator.ts";

interface Props {
  conn: Conn;
  kind: HealthKind;
  label: string;
}

// animationFor: syncing pulses, reconnecting flickers, offline holds still.
function animationFor(conn: Conn, kind: HealthKind): string {
  if (kind === "syncing") return "pulse 1.2s ease-in-out infinite";
  if (conn === "connected" && kind === "synced") {
    return "bulbBreathe 3.5s ease-in-out infinite";
  }
  if (conn === "reconnecting") return "bulbFlicker 1.6s linear infinite";
  return "none";
}

// HealthDot: 12px bulb with sync core plus connection halo and motion.
export function HealthDot({ conn, kind, label }: Props) {
  const dot = kind === "offline" ? SYNC_DOT.offline : SYNC_DOT[kind];
  const halo = conn === "connected" ? dot : "#f87171";
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      style={{
        width: 12,
        height: 12,
        borderRadius: 99,
        flexShrink: 0,
        background: dot,
        boxShadow:
          `0 0 3px ${dot}, 0 0 10px ${halo}, 0 0 22px color-mix(in srgb, ${dot} 35%, transparent)`,
        animation: animationFor(conn, kind),
      }}
    />
  );
}
