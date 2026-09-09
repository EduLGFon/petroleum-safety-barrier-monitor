// Settings panel chrome - dialog header and footer.
// Why: isolates the branded header/close button and version footer so the
// SettingsPanel shell keeps only backdrop, tabs, and section switching.
import { withBrand } from "../../lib/company.ts";
import { CloseIcon } from "../ui/Icons.tsx";

// PanelHeader: branded title block with glow accent and close button.
export function PanelHeader(
  { companyName, onClose }: { companyName: string; onClose: () => void },
) {
  return (
    <div
      style={{
        padding: "var(--d-dialog-head)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--bg-elevated)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -20,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: "radial-gradient(circle,var(--glow) 0%,transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div>
        <div
          style={{
            fontSize: "var(--d-micro)",
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: "var(--d-gap-2xs)",
          }}
        >
          {companyName || "Configurações"}
        </div>
        <div
          style={{
            fontSize: "var(--d-panel-title)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          Configurações
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="lift"
        style={{
          width: "var(--d-close-btn)",
          height: "var(--d-close-btn)",
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
  );
}

// PanelFooter: branded version line pinned to the dialog bottom.
export function PanelFooter({ companyName }: { companyName: string }) {
  return (
    <div
      style={{
        marginTop: "auto",
        padding: "var(--d-foot-pad)",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        fontSize: "var(--d-caption)",
        color: "var(--text-muted)",
        textAlign: "center",
        letterSpacing: "0.05em",
        flexShrink: 0,
      }}
    >
      {withBrand(companyName, "Monitor de Barreiras")} · v0.4
    </div>
  );
}
