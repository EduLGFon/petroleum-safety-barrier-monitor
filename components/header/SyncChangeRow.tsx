// SyncChangeRow - one expandable change row (light until expanded).
// This is why it exists: the list never loads snapshots; expanding a row
// fetches exactly one barrier's before/after diff.
import { useBarrierSyncDetail } from "../../hooks/dashboard/sync-barrier-detail.ts";

import { syncFieldLabel, syncFieldValue } from "./sync-fields.ts";

import { formatInstant } from "../../lib/sync-indicator.ts";

import type { SyncChangeItem } from "../../lib/types.ts";

import { useState } from "preact/hooks";

const KIND_META: Record<string, { word: string; color: string }> = {
  new: { word: "Nova", color: "#17c964" },
  updated: { word: "Atualizada", color: "#f5a524" },
  removed: { word: "Removida", color: "#f31260" },
};

export function SyncChangeRow(
  { item, baseUrl, runId, scope, onOpenBarrier }: {
    item: SyncChangeItem;
    baseUrl: string;
    runId: number | null;
    scope: "last-run" | "last-day";
    onOpenBarrier?: (barrierId: number) => void;
  },
) {
  const [open, setOpen] = useState(false);
  const { detail, loading, error } = useBarrierSyncDetail(
    baseUrl,
    open ? item.barrierId : null,
    { runId, scope },
    true,
  );
  const meta = KIND_META[item.kind] ?? KIND_META["updated"]!;
  const at = formatInstant(item.changedAt);
  const badges = (item.changedFields ?? []).slice(0, 3);
  const extra = (item.changedFields ?? []).length - badges.length;
  return (
    <div
      style={{
        border: "1px solid var(--au-row)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "6px 8px",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: meta.color,
              background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
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
            {item.tag}
          </span>
          <span
            style={{ marginLeft: "auto", color: "var(--au-sub)", fontSize: 11 }}
          >
            {open ? "▾" : "▸"}
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
          {[
            item.location,
            item.oldStatus ? `${item.oldStatus} → ` : "",
            item.status,
            at?.dateTime,
          ]
            .filter(Boolean).join(" · ")}
        </div>
        {badges.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {badges.map((f) => (
              <span
                key={f}
                style={{
                  fontSize: 10,
                  color: "var(--au-pill-text)",
                  background: "var(--au-row)",
                  borderRadius: 99,
                  padding: "1px 6px",
                }}
              >
                {syncFieldLabel(f)}
              </span>
            ))}
            {extra > 0 && (
              <span style={{ fontSize: 10, color: "var(--au-sub)" }}>
                +{extra}
              </span>
            )}
          </div>
        )}
      </button>
      {open && (
        <div
          style={{
            borderTop: "1px solid var(--au-row)",
            padding: "6px 8px",
            fontSize: 11,
          }}
        >
          {loading && (
            <div style={{ color: "var(--au-sub)" }}>Carregando detalhe…</div>
          )}
          {error && <div style={{ color: "#f31260" }}>{error}</div>}
          {!loading && !error && !detail && (
            <div style={{ color: "var(--au-sub)" }}>
              Detalhe indisponível para sincronizações antigas (sem trilha por
              barreira).
            </div>
          )}
          {detail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {detail.changedFields.length === 0 && detail.kind !== "new" &&
                detail.kind !== "removed" && (
                <div style={{ color: "var(--au-sub)" }}>
                  Somente status alterado.
                </div>
              )}
              {detail.changedFields.map((f) => (
                <div
                  key={f}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1fr 1fr",
                    gap: 6,
                  }}
                >
                  <span style={{ color: "var(--au-sub)" }}>
                    {syncFieldLabel(f)}
                  </span>
                  <span style={{ overflowWrap: "anywhere" }}>
                    {syncFieldValue(
                      f,
                      (detail.oldSnapshot as Record<string, unknown>)[f],
                    )}
                  </span>
                  <span
                    style={{
                      overflowWrap: "anywhere",
                      color: "var(--au-value)",
                    }}
                  >
                    → {syncFieldValue(
                      f,
                      (detail.newSnapshot as Record<string, unknown>)[f],
                    )}
                  </span>
                </div>
              ))}
              {onOpenBarrier && (
                <button
                  type="button"
                  onClick={() => onOpenBarrier(item.barrierId)}
                  style={{
                    alignSelf: "flex-start",
                    border: "1px solid var(--au-card-border)",
                    background: "transparent",
                    color: "var(--au-pill-text)",
                    borderRadius: 8,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  Abrir barreira
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
