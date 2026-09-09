// NcAlert - non-conforme urgency card with show-urgentes toggle action.
// This is why it exists: isolates the red-glass alert markup from DashboardView
// so the island root stays slim while preserving the urgency treatment.
import {
  AlertTriangleIcon,
  ArrowRightIcon,
} from "../../components/ui/Icons.tsx";

interface NcAlertProps {
  ncCount: number;
  isUrgentesActive: boolean;
  showUrgentes: () => void;
  resetFilters: () => void;
}

// NcAlert: red glass urgency card; null when nothing is non-conforme.
export function NcAlert(
  { ncCount, isUrgentesActive, showUrgentes, resetFilters }: NcAlertProps,
) {
  if (ncCount <= 0) return null;
  return (
    <div
      className="animate-fade-in glass-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-gap)",
        padding: "var(--d-alert-pad)",
        marginBottom: "var(--d-stack)",
        background: "var(--alert-nc-bg)",
        border: "1px solid var(--alert-nc-border)",
        borderRadius: 12,
        boxShadow: "0 0 24px rgba(239,68,68,.25)",
        animationDelay: ".32s",
      }}
    >
      <AlertTriangleIcon
        size={18}
        color="var(--alert-nc-text)"
        strokeWidth={2}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "var(--d-lead)",
            fontWeight: 700,
            color: "var(--alert-nc-text)",
          }}
        >
          {ncCount.toLocaleString("pt-BR")} barreira{ncCount > 1 ? "s" : ""}
          {" "}
          não conforme{ncCount > 1 ? "s" : ""}
        </div>
        <div
          style={{
            fontSize: "var(--d-small)",
            color: "var(--alert-nc-sub)",
            marginTop: 2,
          }}
        >
          Degradadas, indisponíveis ou novos status · ordenadas da mais urgente
        </div>
      </div>
      <button
        type="button"
        className="lift"
        onClick={() => isUrgentesActive ? resetFilters() : showUrgentes()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-gap-xs)",
          fontSize: "var(--d-small)",
          fontWeight: 700,
          padding: "var(--d-alert-btn)",
          borderRadius: "var(--d-btn-radius)",
          background: "color-mix(in srgb,var(--alert-nc-text) 12%,transparent)",
          border:
            "1px solid color-mix(in srgb,var(--alert-nc-text) 35%,transparent)",
          color: "var(--alert-nc-text)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isUrgentesActive ? "Limpar filtro" : (
          <>
            <ArrowRightIcon
              size={12}
              color="var(--alert-nc-text)"
              strokeWidth={2.5}
            />{" "}
            Ver urgentes
          </>
        )}
      </button>
    </div>
  );
}
