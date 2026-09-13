// BarrierHeader - header/badges/NC alert part for the barrier dialog.
// Why: isolates title/badges/NC alert so the shell Content stays small.
import {
  AlertTriangleIcon,
  CloseIcon,
  MapPinIcon,
  TagIcon,
} from "../ui/Icons.tsx";
import { CONF_COLORS, CRIT_COLORS, DISP_COLORS } from "../../lib/constants.ts";
import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";
import type { Barrier } from "../../lib/types.ts";
import { Badge } from "../ui/Badge.tsx";
// BarrierHeader renders title/badges and NC alert with days-since logic.
// Takes barrier + close handler; tab switching lives in the shell Content.
export function BarrierHeader(
  { b, onClose }: { b: Barrier; onClose: () => void },
) {
  const dc = DISP_COLORS[b.disponibilidade],
    cc = CONF_COLORS[b.conformidade],
    crc = CRIT_COLORS[b.criticidade];
  const isNC = b.conformidade === "Não Conforme";
  const ncDays = isNC && b.statusSince ? daysSince(b.statusSince) : 0;
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
            alignItems: "flex-start",
            gap: "var(--d-gap)",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--d-gap-xs)",
                marginBottom: "var(--d-gap-xs)",
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
                }}
              >
                Barreira #{b.id} · {b.instalacao}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--d-dialog-title)",
                fontWeight: 600,
                color: "var(--text-primary)",
                wordBreak: "break-all",
                lineHeight: 1.2,
              }}
            >
              {b.tag}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--d-mini-gap)",
                marginTop: "var(--d-mini-gap)",
              }}
            >
              <MapPinIcon size={11} color="var(--text-muted)" strokeWidth={2} />
              <span
                style={{
                  fontSize: "var(--d-body)",
                  color: "var(--text-muted)",
                }}
              >
                {b.locDesc}
              </span>
            </div>
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
        <div
          style={{
            display: "flex",
            gap: "var(--d-gap-xs)",
            marginTop: "var(--d-stack)",
            flexWrap: "wrap",
          }}
        >
          <Badge label={b.disponibilidade} {...dc} />
          <Badge label={b.conformidade} {...cc} />
          <Badge label={b.criticidade} {...crc} size="sm" />
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
                {!b.planoAcao ? " · Sem plano de ação definido" : ""}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
