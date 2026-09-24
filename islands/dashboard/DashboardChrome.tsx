// Dashboard chrome - footer signature line and overlay dialogs.
// Why: keeps DashboardView to section composition; footer and modal wiring
// render once and change rarely.
import { SettingsPanel } from "../../components/SettingsPanel.tsx";

import { BarrierModal } from "../../components/BarrierModal.tsx";

import type { AuthUser, Barrier } from "../../lib/types.ts";

// DashboardFooter: centered author signature closing the page.
export function DashboardFooter() {
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
      Desenvolvido por Energy Júnior - 2026
    </div>
  );
}

interface OverlaysProps {
  openBarrier: Barrier | null;
  onCloseBarrier: () => void;
  onBarrierSaved?: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  sessionUser?: AuthUser | null;
  // Live vocabularies forwarded to the settings filters section.
  locations?: { code: string; name: string; type: string }[];
  availabilities?: string[];
  compliances?: string[];
  criticalities?: string[];
  categories?: string[];
}

// DashboardOverlays: detail modal plus settings drawer above the page.
export function DashboardOverlays(
  {
    openBarrier,
    onCloseBarrier,
    onBarrierSaved,
    settingsOpen,
    onCloseSettings,
    sessionUser = null,
    locations,
    availabilities,
    compliances,
    criticalities,
    categories,
  }: OverlaysProps,
) {
  return (
    <>
      <BarrierModal
        barrier={openBarrier}
        onClose={onCloseBarrier}
        sessionUser={sessionUser}
        onSaved={onBarrierSaved}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={onCloseSettings}
        sessionUser={sessionUser}
        locations={locations}
        availabilities={availabilities}
        compliances={compliances}
        criticalities={criticalities}
        categories={categories}
      />
    </>
  );
}
