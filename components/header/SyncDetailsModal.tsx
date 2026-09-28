// SyncDetailsModal - tabbed sync audit dialog (last run + last 24h).
// This is why it exists: the hover card stays a skim-friendly summary;
// per-barrier analysis (filter, search, paging, expand-for-diff) lives here.
// Rows load snapshots lazily so the modal never fetches all diffs at once.
import {
  formatDuration,
  formatInstant,
  friendlyScope,
  healthLabel,
  SYNC_DOT,
  toHealthKind,
} from "../../lib/sync-indicator.ts";

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { lockBody, unlockBody } from "../../lib/body-lock.ts";

import type { Conn } from "../../hooks/useConnection.ts";

import { Row, SectionTitle } from "./SyncHoverCard.tsx";

import { SyncChangesList } from "./SyncChangesList.tsx";

import type { SyncStatus } from "../../lib/types.ts";

interface Props {
  sync: SyncStatus;
  conn: Conn;
  baseUrl: string;
  onClose: () => void;
  onOpenBarrier?: (barrierId: number) => void;
}

export function SyncDetailsModal(
  { sync, conn, baseUrl, onClose, onOpenBarrier }: Props,
) {
  const run = sync.lastRun;
  const kind = toHealthKind(sync, conn);
  const end = run ? formatInstant(run.finishedAt) : null;
  const [tab, setTab] = useState<"last-run" | "last-day">("last-run");
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
            maxWidth: 520,
            maxHeight: "86dvh",
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
                Nenhuma sincronização registrada ainda.
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
                <Row
                  k="Resultado"
                  v={run.status === "ok" ? "Concluída" : "Falhou"}
                />
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
            {run && (
              <div
                style={{ display: "flex", gap: 6 }}
                role="tablist"
                aria-label="Escopo das alterações"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "last-run"}
                  onClick={() => setTab("last-run")}
                  style={{
                    flex: 1,
                    border: "1px solid var(--au-card-border)",
                    background: tab === "last-run"
                      ? "var(--au-row)"
                      : "transparent",
                    color: "var(--au-pill-text)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: tab === "last-run" ? 700 : 400,
                  }}
                >
                  Última sync
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "last-day"}
                  onClick={() => setTab("last-day")}
                  style={{
                    flex: 1,
                    border: "1px solid var(--au-card-border)",
                    background: tab === "last-day"
                      ? "var(--au-row)"
                      : "transparent",
                    color: "var(--au-pill-text)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: tab === "last-day" ? 700 : 400,
                  }}
                >
                  Últimas 24h
                </button>
              </div>
            )}
            {run && baseUrl && (
              <SyncChangesList
                baseUrl={baseUrl}
                scope={tab}
                onOpenBarrier={onOpenBarrier}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
