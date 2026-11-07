// SyncSection - settings page mirroring the former sync details modal.
// This is why it exists: sync history now lives inside the centered settings
// workspace instead of a separate modal, reusing SyncChangesList and the
// same last-run metadata and technical note.
import {
  formatDuration,
  formatInstant,
  friendlyScope,
  healthLabel,
  isReapedNote,
  runResultLabel,
  SYNC_DOT,
  toHealthKind,
} from "../../lib/sync-indicator.ts";

import { Row, SectionTitle } from "../../components/header/SyncHoverCard.tsx";

import { SyncChangesList } from "../../components/header/SyncChangesList.tsx";

import type { Conn } from "../../hooks/useConnection.ts";

import type { SyncStatus } from "../../lib/types.ts";

import { useEffect, useState } from "preact/hooks";

interface Props {
  sync: SyncStatus | null;
  conn?: Conn;
  baseUrl?: string;
  onOpenBarrier?: (barrierId: number) => void;
}

export function SyncSection(
  { sync, conn = "connected", baseUrl = "", onOpenBarrier }: Props,
) {
  const run = sync?.lastRun ?? null;
  const kind = toHealthKind(sync, conn);
  const end = run ? formatInstant(run.finishedAt) : null;
  const reaped = run ? isReapedNote(run.note) : false;
  const duration = run
    ? formatDuration(run.startedAt, run.finishedAt) +
      (reaped ? " (tempo órfã até limpeza)" : "")
    : null;
  const [tab, setTab] = useState<"last-run" | "last-day">("last-run");

  useEffect(() => {
    setTab("last-run");
  }, [sync?.lastRun?.finishedAt]);

  return (
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {!sync && (
        <div style={{ color: "var(--text-muted)", fontSize: "var(--d-small)" }}>
          Sincronização indisponível neste modo.
        </div>
      )}
      {sync && !run && (
        <div style={{ color: "var(--text-muted)", fontSize: "var(--d-small)" }}>
          Nenhuma sincronização registrada ainda.
        </div>
      )}
      {sync && run && end && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontWeight: 700, color: SYNC_DOT[kind] }}>
              {healthLabel(kind)}
            </span>
            <span
              style={{ color: "var(--au-sub)", fontSize: "var(--d-small)" }}
            >
              {end.relative}
            </span>
          </div>
          <Row k="Quando" v={end.full} />
          {duration && <Row k="Duração" v={duration} />}
          <Row k="Origem" v={friendlyScope(run.scope)} />
          <Row k="Resultado" v={runResultLabel(run.status, run.note)} />
        </div>
      )}
      {sync && run?.note && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionTitle text="DETALHE TÉCNICO" />
          <div
            style={{
              fontSize: "var(--d-small)",
              color: "var(--au-sub)",
              overflowWrap: "anywhere",
            }}
          >
            {run.note}
          </div>
        </div>
      )}
      {sync && run && (
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
              background: tab === "last-run" ? "var(--au-row)" : "transparent",
              color: "var(--au-pill-text)",
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
              fontSize: "var(--d-small)",
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
              background: tab === "last-day" ? "var(--au-row)" : "transparent",
              color: "var(--au-pill-text)",
              borderRadius: 8,
              padding: "6px 8px",
              cursor: "pointer",
              fontSize: "var(--d-small)",
              fontWeight: tab === "last-day" ? 700 : 400,
            }}
          >
            Últimas 24h
          </button>
        </div>
      )}
      {sync && run && (
        <SyncChangesList
          baseUrl={baseUrl}
          scope={tab}
          onOpenBarrier={(id) => {
            onOpenBarrier?.(id);
          }}
        />
      )}
    </div>
  );
}
