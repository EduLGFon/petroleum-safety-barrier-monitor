// SyncHoverCard - plain-language sync summary for hover/focus.
// This is why it exists: the subtitle line stays one short row, while the
// full story (when, how long, what changed, which items) rides this card.
// Labels avoid sync jargon so first-time operators read it with no glossary.
import {
  formatDuration,
  formatInstant,
  friendlyScope,
  healthLabel,
  SYNC_DOT,
  toHealthKind,
} from "../../lib/sync-indicator.ts";

import type { SyncChange, SyncStatus } from "../../lib/types.ts";

import type { Conn } from "../../hooks/useConnection.ts";

import { fmt } from "../../lib/utils.ts";

interface Props {
  sync: SyncStatus | null;
  conn: Conn;
  changes: SyncChange[] | null;
}

// Row: label/value pair inside the card body.
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--au-sub)", flexShrink: 0 }}>{k}</span>
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

// Stat: one labeled count (big aligned number, small caption). Numbers share
// one tabular size and one row height so the four blocks always line up.
function Stat(
  { value, caption, color }: { value: number; caption: string; color: string },
) {
  return (
    <div style={{ textAlign: "center", padding: "6px 2px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 19,
          fontWeight: 700,
          lineHeight: "22px",
          color,
        }}
      >
        {fmt(value)}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".04em",
          color: "var(--au-sub)",
          marginTop: 2,
        }}
      >
        {caption}
      </div>
    </div>
  );
}

// SectionTitle: small uppercase caption splitting card sections.
function SectionTitle({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".12em",
        color: "var(--au-sub)",
      }}
    >
      {text}
    </div>
  );
}

// markerFor: list bullet per change kind (matches the subtitle chips).
function markerFor(kind: SyncChange["kind"]): { glyph: string; color: string } {
  if (kind === "new") return { glyph: "+", color: "#17c964" };
  if (kind === "removed") return { glyph: "-", color: "#f31260" };
  return { glyph: "~", color: "#f5a524" };
}

// SyncHoverCard: absolute card with the sync story in reading order.
export function SyncHoverCard({ sync, conn, changes }: Props) {
  const run = sync?.lastRun ?? null;
  const kind = toHealthKind(sync, conn);
  const end = run ? formatInstant(run.finishedAt) : null;
  const running = sync?.runningSince ? formatInstant(sync.runningSince) : null;
  const headlineRel = kind === "syncing" ? running?.relative : end?.relative;
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontWeight: 700, color: SYNC_DOT[kind] }}>
          {healthLabel(kind)}
        </span>
        {headlineRel && (
          <span style={{ color: "var(--au-sub)", fontSize: 11 }}>
            {headlineRel}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {end && <Row k="Quando" v={end.full} />}
        {run && (
          <Row k="Duração" v={formatDuration(run.startedAt, run.finishedAt)} />
        )}
        {run && <Row k="Origem" v={friendlyScope(run.scope)} />}
        {!run && <Row k="Quando" v="nenhuma sync registrada ainda" />}
      </div>
      {run && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionTitle text="O QUE MUDOU" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              border: "1px solid var(--au-row)",
              borderRadius: 8,
            }}
          >
            <Stat value={run.inserts} caption="Novas" color="#17c964" />
            <Stat value={run.updates} caption="Atualizadas" color="#f5a524" />
            <Stat value={run.deletes} caption="Removidas" color="#f31260" />
            <Stat value={run.skips} caption="Sem alteração" color="#a1a1aa" />
          </div>
        </div>
      )}
      {changes !== null && run && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {changes.length === 0
            ? (
              <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
                Nenhum item alterado - {fmt(run.skips)} verificados sem mudança.
              </div>
            )
            : (
              changes.slice(0, 5).map((c) => {
                const m = markerFor(c.kind);
                return (
                  <div
                    key={`${c.kind}-${c.barrierId}`}
                    title={`${c.tag} - ${c.location} - ${c.status}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        color: m.color,
                        fontWeight: 800,
                        fontFamily: "var(--font-mono)",
                        flexShrink: 0,
                      }}
                    >
                      {m.glyph}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--au-value)",
                        flexShrink: 0,
                      }}
                    >
                      {c.tag}
                    </span>
                    <span
                      style={{
                        color: "var(--au-sub)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.location || c.status}
                    </span>
                  </div>
                );
              })
            )}
        </div>
      )}
      {run?.note && (
        <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
          Detalhe técnico: {run.note.slice(0, 200)}
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
        {sync && `${fmt(sync.totals.barriers)} barreiras monitoradas - `}
        {connLabel} - atualiza a cada 1 min
      </div>
    </div>
  );
}
