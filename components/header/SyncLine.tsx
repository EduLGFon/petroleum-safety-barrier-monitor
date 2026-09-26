// SyncLine - one-row subtitle under the header title.
// This is why it exists: the exact local sync instant plus colored delta
// chips live here, keeping the h1 row clean. Format follows the approved
// concept: label, time date, then +3 ~12 -1 chips.
import {
  formatInstant,
  healthLabel,
  toDeltas,
  toHealthKind,
} from "../../lib/sync-indicator.ts";

import type { Conn } from "../../hooks/useConnection.ts";

import type { SyncStatus } from "../../lib/types.ts";

import { SyncDeltas } from "./SyncDeltas.tsx";

interface Props {
  sync: SyncStatus | null;
  conn: Conn;
}

// SyncLine: status word plus local instant plus delta chips. Renders
// nothing in mock mode (null sync) so the header keeps its old height.
export function SyncLine({ sync, conn }: Props) {
  if (sync === null) return null;
  const kind = toHealthKind(sync, conn);
  const label = conn === "disconnected" && sync.lastRun !== null
    ? `Desconectado - última`
    : healthLabel(kind);
  const instantIso = kind === "syncing" && sync.runningSince !== null
    ? sync.runningSince
    : sync.lastRun?.finishedAt ?? null;
  const parts = formatInstant(instantIso);
  const deltas = toDeltas(sync.lastRun);
  const showInstant = parts !== null && kind !== "never";
  return (
    <div
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--au-sub)",
        lineHeight: "16px",
        opacity: conn === "disconnected" ? 0.75 : 1,
      }}
    >
      <span style={{ color: "var(--au-pill-text)" }}>{label}</span>
      {showInstant && parts && (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
          {parts.dateTime}
        </span>
      )}
      {showInstant && parts && <span aria-hidden="true">-</span>}
      <SyncDeltas deltas={kind === "syncing" ? null : deltas} />
    </div>
  );
}
