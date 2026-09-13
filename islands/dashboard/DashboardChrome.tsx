// Dashboard chrome - footer brand line and overlay dialogs.
// Why: keeps DashboardView to section composition; footer and modal wiring
// render once and change rarely.
import { SettingsPanel } from "../../components/SettingsPanel.tsx";
import { BarrierModal } from "../../components/BarrierModal.tsx";
import { withBrand } from "../../lib/company.ts";
import type { Barrier } from "../../lib/types.ts";

// DashboardFooter: centered brand line closing the page.
export function DashboardFooter({ companyName }: { companyName: string }) {
  return (
    <div
      className="tnum"
      style={{
        marginTop: "var(--d-foot-gap)",
        textAlign: "center",
        fontSize: "var(--d-caption)",
        color: "var(--text-muted)",
        letterSpacing: "0.08em",
        animation: "fadeInFast .4s .5s both",
      }}
    >
      {withBrand(companyName, "Monitor de Barreiras de Segurança")}
    </div>
  );
}

interface OverlaysProps {
  openBarrier: Barrier | null;
  onCloseBarrier: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  companyName: string;
}

// DashboardOverlays: detail modal plus settings drawer above the page.
export function DashboardOverlays(
  {
    openBarrier,
    onCloseBarrier,
    settingsOpen,
    onCloseSettings,
    companyName,
  }: OverlaysProps,
) {
  return (
    <>
      <BarrierModal barrier={openBarrier} onClose={onCloseBarrier} />
      <SettingsPanel
        open={settingsOpen}
        onClose={onCloseSettings}
        companyName={companyName}
      />
    </>
  );
}
