// BarrierHeader - slim title bar + NC alert for the barrier dialog.
// Why: isolates the title/alert so the shell Content stays small. Badges and
// the big tag title live in the Details tab status strip instead - except the
// visibility-scope tag, which sits in this header so every tab (including
// history and edit on off-scope rows) carries the scope context.
import { AlertTriangleIcon, CloseIcon, TagIcon } from "../ui/Icons.tsx";

import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";

import { DISP_COLORS, SCOPE_COLORS } from "../../lib/constants.ts";

import type { Barrier } from "../../lib/types.ts";

import { Badge } from "../ui/Badge.tsx";

// BarrierHeader renders the slim "Barreira #id · tag" bar and NC alert with
// days-since logic. Takes barrier + close handler; tab switching lives in
// the shell Content.
export function BarrierHeader(
  { b, onClose }: { b: Barrier; onClose: () => void },
) {
  const dc = DISP_COLORS[b.availability];
  const isNC = b.compliance === "Não Conforme";
  const ncDays = isNC && b.statusSince ? daysSince(b.statusSince) : 0;
  // Visibility scope mirrors the table row chips: deleted wins over the
  // upstream flag, absent flags read as active/live. Only off-scope rows
  // carry a tag, so active dialogs render exactly as before.
  const deleted = (b.deletedAt ?? null) !== null;
  const inactive = !deleted && (b.isActive ?? true) === false;
  return (
    <>
      {/* Header */}
      <div
        style={{
          padding: "var(--d-dialog-head)",
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -20,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: `radial-gradient(circle,${
              dc?.solid ?? "#3b82f6"
            }18 0%,transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background: `linear-gradient(90deg,${
              dc?.solid ?? "#3b82f6"
            },transparent)`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--d-gap)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-gap-xs)",
              minWidth: 0,
              flex: 1,
            }}
          >
            <TagIcon size={11} color="var(--text-muted)" strokeWidth={2} />
            <span
              style={{
                fontSize: "var(--d-caption)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              Barreira #{b.id} · {b.tag}
            </span>
            {(deleted || inactive) && (
              <span
                style={{ flexShrink: 0 }}
                title={deleted && b.deletedAt
                  ? `Excluída em ${fmtDate(b.deletedAt)}`
                  : undefined}
              >
                <Badge
                  label={deleted ? "Excluída" : "Desativada"}
                  {...SCOPE_COLORS[deleted ? "Excluída" : "Desativada"]}
                  size="sm"
                />
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lift"
            style={{
              width: "var(--d-close-btn)",
              height: "var(--d-close-btn)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-surface)",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--d-input-radius)",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5} />
          </button>
        </div>
        {isNC && b.statusSince && (
          <div
            style={{
              marginTop: "var(--d-stack-sm)",
              padding: "var(--d-row-pad)",
              background: "var(--alert-nc-bg)",
              border: "1px solid var(--alert-nc-border)",
              borderRadius: "var(--d-row-radius)",
              display: "flex",
              alignItems: "center",
              gap: "var(--d-bar-gap)",
            }}
          >
            <AlertTriangleIcon
              size={16}
              color="var(--alert-nc-text)"
              strokeWidth={2}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "var(--d-body)",
                  fontWeight: 700,
                  color: "var(--alert-nc-text)",
                }}
              >
                {humanDuration(ncDays)} sem contingenciamento
              </div>
              <div
                style={{
                  fontSize: "var(--d-small)",
                  color: "var(--alert-nc-sub)",
                  marginTop: 2,
                }}
              >
                Não conforme desde {fmtDate(b.statusSince)}
                {!b.actionPlan ? " · Sem plano de ação definido" : ""}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
