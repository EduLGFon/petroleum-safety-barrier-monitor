// BarrierHeader - hero header with decision strip for the barrier dialog.
import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";

import { ClockIcon, CloseIcon, TagIcon } from "../ui/Icons.tsx";

import { DISP_COLORS } from "../../lib/constants.ts";

import type { Barrier } from "../../lib/types.ts";

import { Badge } from "../ui/Badge.tsx";

export function BarrierHeader(
  { b, onClose }: { b: Barrier; onClose: () => void },
) {
  const dc = DISP_COLORS[b.availability];
  const isNC = b.compliance === "Não Conforme";
  return (
    <>
      <div
        style={{
          padding: "var(--d-dialog-head)",
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
          borderLeft: `4px solid ${dc?.solid ?? "var(--accent)"}`,
          position: "relative",
          flexShrink: 0,
        }}
      >
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
                Barreira #{b.id} · {b.tag}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--d-gap-xs)",
                marginBottom: "var(--d-stack-sm)",
              }}
            >
              <Badge label={b.availability} {...(dc ?? neutral())} size="sm" />
              <Badge
                label={b.compliance}
                {...(CONF_COLORS_SAFE(b.compliance))}
                size="sm"
              />
              <Badge
                label={b.criticality}
                {...(CRIT_COLORS_SAFE(b.criticality))}
                size="sm"
              />
              {b.statusSince && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--d-mini-gap)",
                    fontSize: "var(--d-small)",
                    fontWeight: 600,
                    color: isNC ? "var(--alert-nc-text)" : "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <ClockIcon
                    size={12}
                    color={isNC ? "var(--alert-nc-text)" : "var(--text-muted)"}
                    strokeWidth={2}
                  />
                  {isNC
                    ? `${
                      humanDuration(daysSince(b.statusSince))
                    } sem contingenciamento · desde ${fmtDate(b.statusSince)}`
                    : `${
                      humanDuration(daysSince(b.statusSince))
                    } neste status · desde ${fmtDate(b.statusSince)}`}
                </span>
              )}
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
            aria-label="Fechar"
          >
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </>
  );
}

// helper imports inline to avoid extra import churn
import { CONF_COLORS, CRIT_COLORS } from "../../lib/constants.ts";

function neutral() {
  return { solid: "#94a3b8", bg: "transparent", border: "var(--border)" };
}
function CONF_COLORS_SAFE(v: string) {
  return CONF_COLORS[v] ?? neutral();
}
function CRIT_COLORS_SAFE(v: string) {
  return CRIT_COLORS[v] ?? neutral();
}
