// Settings panel chrome - dialog header.
// Why: isolates the title block and close button so the SettingsPanel shell
// keeps only backdrop, tabs, and section switching. No brand copy lives
// here by design.
import { CloseIcon } from "../ui/Icons.tsx";

// PanelHeader: plain title block with glow accent and close button.
export function PanelHeader({ onClose }: { onClose: () => void }) {
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
