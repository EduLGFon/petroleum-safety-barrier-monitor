// BarrierHistory - History timeline section for the barrier dialog.
// Why: isolates newest-first statusHistory rendering so the shell stays small.
import { CalendarIcon, UserIcon } from "../ui/Icons.tsx";
import { DISP_COLORS } from "../../lib/constants.ts";
import type { Barrier } from "../../lib/types.ts";
import { fmtDate } from "../../lib/utils.ts";
import { Badge } from "../ui/Badge.tsx";
import { Sec } from "./primitives.tsx";
// BarrierHistory renders statusHistory newest-first timeline with current-entry highlight.
export function BarrierHistory({ b }: { b: Barrier }) {
  const history = [...b.statusHistory].reverse();
  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
      <Sec>Histórico de Status</Sec>
      <div style={{ position: "relative", marginTop: 8 }}>
        <div
          style={{
            position: "absolute",
            left: 13,
            top: 0,
            bottom: 0,
            width: 2,
            background:
              "linear-gradient(180deg,var(--accent) 0%,var(--border) 100%)",
            borderRadius: 1,
          }}
        />
        {history.map((entry, i) => {
          const cfg = DISP_COLORS[entry.status], isFirst = i === 0;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: "var(--d-history-gap)",
                marginBottom: i < history.length - 1 ? "var(--d-block-gap)" : 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 28,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: isFirst
                      ? cfg?.solid ?? "var(--accent)"
                      : "var(--bg-elevated)",
                    border: `2.5px solid ${cfg?.solid ?? "var(--border)"}`,
                    boxShadow: isFirst
                      ? `0 0 10px ${cfg?.solid ?? "var(--accent)"}55`
                      : "none",
                    marginTop: 3,
                    zIndex: 1,
                    flexShrink: 0,
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "var(--d-row-pad)",
                  background: isFirst
                    ? cfg?.bg ?? "var(--bg-elevated)"
                    : "var(--bg-elevated)",
                  border: `1px solid ${
                    isFirst ? cfg?.border ?? "var(--border)" : "var(--border)"
                  }`,
                  borderRadius: "var(--d-row-radius)",
                  boxShadow: isFirst ? "var(--shadow-sm)" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--d-opt-gap)",
                    marginBottom: "var(--d-field-gap)",
                  }}
                >
                  <Badge
                    label={entry.status}
                    {...(cfg ??
                      {
                        solid: "#94a3b8",
                        bg: "transparent",
                        border: "var(--border)",
                      })}
                    size="sm"
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--d-gap-2xs)",
                    }}
                  >
                    <CalendarIcon
                      size={11}
                      color="var(--text-muted)"
                      strokeWidth={2}
                    />
                    <span
                      style={{
                        fontSize: "var(--d-small)",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtDate(entry.date)}
                    </span>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--d-body)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  {entry.note}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--d-mini-gap)",
                    marginTop: "var(--d-field-gap)",
                  }}
                >
                  <UserIcon
                    size={11}
                    color="var(--text-muted)"
                    strokeWidth={2}
                  />
                  <span
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {entry.author}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
