// Dashboard chrome - footer signature line and overlay dialogs.
// Why: keeps DashboardView to section composition; footer and modal wiring
// render once and change rarely.
import type { SettingsSection } from "../../components/SettingsPanel.tsx";

import type { AuthUser, Barrier, SyncStatus } from "../../lib/types.ts";

import { SettingsPanel } from "../../components/SettingsPanel.tsx";

import { BarrierModal } from "../../components/BarrierModal.tsx";

import type { Conn } from "../../hooks/useConnection.ts";

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
  initialSection?: SettingsSection;
  sessionUser?: AuthUser | null;
  devFracttalRaw?: boolean;
  serverMode: boolean;
  apiBaseUrl: string;
  syncStatus?: SyncStatus | null;
  conn?: Conn;
  onOpenBarrier?: (barrierId: number) => void;
  // Live vocabularies forwarded to the settings filters section.
  locations?: { code: string; name: string; type: string }[];
  availabilities?: string[];
  compliances?: string[];
  criticalities?: string[];
  categories?: string[];
  typologies?: string[];
}

// DashboardOverlays: detail modal plus settings drawer above the page.
export function DashboardOverlays(
  {
    openBarrier,
    onCloseBarrier,
    onBarrierSaved,
    settingsOpen,
    onCloseSettings,
    initialSection,
    sessionUser = null,
    devFracttalRaw = false,
    serverMode,
    apiBaseUrl,
    syncStatus = null,
    conn,
    onOpenBarrier,
    locations,
    availabilities,
    compliances,
    criticalities,
    categories,
    typologies,
  }: OverlaysProps,
) {
  return (
    <>
      <BarrierModal
        barrier={openBarrier}
        onClose={onCloseBarrier}
        sessionUser={sessionUser}
        devFracttalRaw={devFracttalRaw}
        connected={serverMode}
        apiBaseUrl={apiBaseUrl}
        onSaved={onBarrierSaved}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={onCloseSettings}
        initialSection={initialSection}
        sessionUser={sessionUser}
        syncStatus={syncStatus}
        conn={conn}
        apiBaseUrl={apiBaseUrl}
        onOpenBarrier={onOpenBarrier}
        locations={locations}
        availabilities={availabilities}
        compliances={compliances}
        criticalities={criticalities}
        categories={categories}
        typologies={typologies}
      />
    </>
  );
}
