// SyncHoverCard - rich sync and item details for hover/focus.
// This is why it exists: the subtitle line stays one short row, while
// the full audit (timestamps, scope, counts, note, connection) rides
// this card. Rendered by Header only while the title block is open.
import type { Conn } from "../../hooks/useConnection.ts";

import type { SyncStatus } from "../../lib/types.ts";

import { formatDuration, formatInstant } from "../../lib/sync-indicator.ts";

interface Props {
  sync: SyncStatus | null;
  conn: Conn;
}

// Row: label/value pair inside the card body.
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--au-sub)" }}>{k}</span>
      <span
        style={{
          color: "var(--au-value)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          textAlign: "right",
          overflowWrap: "anywhere",
        }}
      >
        {v}
      </span>
    </div>
  );
}

// SyncHoverCard: absolute card with run audit plus connection state.
export function SyncHoverCard({ sync, conn }: Props) {
  const run = sync?.lastRun ?? null;
  const start = run ? formatInstant(run.startedAt) : null;
  const end = run ? formatInstant(run.finishedAt) : null;
  const running = sync?.runningSince ? formatInstant(sync.runningSince) : null;
  const connLabel = conn === "connected"
    ? "Conectado"
    : conn === "reconnecting"
    ? "Reconectando…"
    : "Desconectado";
  return (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        zIndex: 40,
        width: 320,
        maxWidth: "min(320px, 80vw)",
        background: "var(--au-dialog)",
        border: "1px solid var(--au-card-border)",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgb(0 0 0 / .45)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 12,
        color: "var(--au-pill-text)",
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--au-value)" }}>
        Sincronização Fracttal
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {run && end && <Row k="Última sync" v={end.full} />}
        {run && end && (
          <Row k="Relativo" v={`${end.relative} (${run.status})`} />
        )}
        {run && start && end && (
          <Row k="Duração" v={formatDuration(run.startedAt, run.finishedAt)} />
        )}
        {run && <Row k="Escopo" v={run.scope} />}
        {running && <Row k="Em andamento desde" v={running.full} />}
        {!run && <Row k="Última sync" v="nenhuma registrada" />}
      </div>
      {run && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 6,
            paddingTop: 4,
          }}
        >
          <Row k="+ novas" v={String(run.inserts)} />
          <Row k="~ atualiz." v={String(run.updates)} />
          <Row k="- remov." v={String(run.deletes)} />
          <Row k="= ignor." v={String(run.skips)} />
        </div>
      )}
      {sync && (
        <Row k="Base monitorada" v={`${sync.totals.barriers} barreiras`} />
      )}
      {run?.note && (
        <div
          style={{
            color: "var(--au-sub)",
            fontSize: 11,
            overflowWrap: "anywhere",
          }}
        >
          {run.note.slice(0, 400)}
        </div>
      )}
      <div
        style={{
          borderTop: "1px solid var(--au-row)",
          paddingTop: 6,
          color: "var(--au-sub)",
          fontSize: 11,
        }}
      >
        {connLabel} - atualiza a cada 5 min
      </div>
    </div>
  );
}
