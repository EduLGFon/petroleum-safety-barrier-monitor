// SyncDetailsModal - full sync audit dialog (items, technical note).
// This is why it exists: the hover card stays a skim-friendly summary;
// everything verbose (full item list with timestamps, raw scope,
// untruncated note) lives here behind "Ver detalhes". Dialog behavior
// mirrors BarrierModal (ESC, backdrop dismiss, body lock, focus trap).
import {
  formatDuration,
  formatInstant,
  friendlyScope,
  healthLabel,
  SYNC_DOT,
  toHealthKind,
} from "../../lib/sync-indicator.ts";

import type { SyncChange, SyncStatus } from "../../lib/types.ts";

import { Row, SectionTitle, Stat } from "./SyncHoverCard.tsx";

import { useCallback, useEffect, useRef } from "preact/hooks";

import { lockBody, unlockBody } from "../../lib/body-lock.ts";

import type { Conn } from "../../hooks/useConnection.ts";

interface Props {
  sync: SyncStatus;
  conn: Conn;
  changes: SyncChange[] | null;
  onClose: () => void;
}

// KIND_WORD: plain pt-BR kind name plus marker tone per change kind.
const KIND_WORD: Record<SyncChange["kind"], { word: string; color: string }> = {
  new: { word: "Nova", color: "#17c964" },
  updated: { word: "Atualizada", color: "#f5a524" },
  removed: { word: "Removida", color: "#f31260" },
};

// SyncDetailsModal: fixed overlay plus scrollable audit panel.
export function SyncDetailsModal({ sync, conn, changes, onClose }: Props) {
  const run = sync.lastRun;
  const kind = toHealthKind(sync, conn);
  const end = run ? formatInstant(run.finishedAt) : null;
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);
  useEffect(() => {
    lockBody();
    return () => unlockBody();
  }, []);
  // Focus management: focus the panel on open; trap Tab inside it.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const connLabel = conn === "connected"
    ? "Conectado"
    : conn === "reconnecting"
    ? "Reconectando…"
    : "Desconectado";
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 990,
          background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(6px)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes da sincronização"
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={trapTab}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 991,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            maxHeight: "84dvh",
            display: "flex",
            flexDirection: "column",
            background: "var(--au-dialog)",
            border: "1px solid var(--au-card-border)",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgb(0 0 0 / .45)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px 0",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700, color: SYNC_DOT[kind] }}>
                {healthLabel(kind)}
              </span>
              {end && (
                <span style={{ color: "var(--au-sub)", fontSize: 11 }}>
                  {end.relative}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes"
              style={{
                border: `1px solid var(--au-card-border)`,
                background: "transparent",
                color: "var(--au-pill-text)",
                borderRadius: 8,
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: 16,
              overflowY: "auto",
              fontSize: 12,
              color: "var(--au-pill-text)",
            }}
          >
            {!run && (
              <div style={{ color: "var(--au-sub)" }}>
                Nenhuma sync registrada ainda.
              </div>
            )}
            {run && end && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Row k="Quando" v={end.full} />
                <Row
                  k="Duração"
                  v={formatDuration(run.startedAt, run.finishedAt)}
                />
                <Row k="Origem" v={friendlyScope(run.scope)} />
                <Row k="Código" v={run.scope} />
                <Row
                  k="Resultado"
                  v={run.status === "ok" ? "Concluída" : "Falhou"}
                />
              </div>
            )}
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
                  <Stat
                    value={run.updates}
                    caption="Atualizadas"
                    color="#f5a524"
                  />
                  <Stat
                    value={run.deletes}
                    caption="Removidas"
                    color="#f31260"
                  />
                  <Stat
                    value={run.skips}
                    caption="Sem alteração"
                    color="#a1a1aa"
                  />
                </div>
              </div>
            )}
            {run && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <SectionTitle
                  text={changes === null
                    ? "ITENS ALTERADOS"
                    : `ITENS ALTERADOS (${changes.length})`}
                />
                {changes === null && (
                  <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
                    Carregando itens…
                  </div>
                )}
                {changes !== null && changes.length === 0 && (
                  <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
                    Nenhum item alterado nesta sync.
                  </div>
                )}
                {changes !== null && changes.map((c) => {
                  const meta = KIND_WORD[c.kind];
                  const at = formatInstant(c.changedAt);
                  return (
                    <div
                      key={`${c.kind}-${c.barrierId}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        padding: "6px 8px",
                        border: "1px solid var(--au-row)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: meta.color,
                            background:
                              `color-mix(in srgb, ${meta.color} 13%, transparent)`,
                            borderRadius: 4,
                            padding: "1px 5px",
                            flexShrink: 0,
                          }}
                        >
                          {meta.word}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            color: "var(--au-value)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.tag}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--au-sub)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {[c.location, c.status, at?.dateTime].filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {run?.note && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SectionTitle text="DETALHE TÉCNICO" />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--au-sub)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {run.note}
                </div>
              </div>
            )}
            <div
              style={{
                borderTop: "1px solid var(--au-row)",
                paddingTop: 8,
                color: "var(--au-sub)",
                fontSize: 11,
              }}
            >
              {connLabel} - atualiza a cada 1 min
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
