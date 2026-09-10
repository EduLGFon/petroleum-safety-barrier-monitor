// DashboardView - mode switch between client and server data views.
// Why: mock mode aggregates the SSR'd list in the browser; HTTP mode pages
// from the API. Both render the shared DashboardSections tree.
import { ServerErrorBanner, ServerErrorCard } from "./ServerError.tsx";
import { useServerDashboard } from "../../hooks/dashboard/server.ts";
import { LoadingScreen } from "../../components/LoadingScreen.tsx";
import { useSettings } from "../../context/SettingsContext.tsx";
import type { Barrier, Vocabularies } from "../../lib/types.ts";
import { DashboardSections } from "./DashboardSections.tsx";
import { useDashboard } from "../../hooks/useDashboard.ts";
import { useDashboardVocabularies } from "./vocabularies.ts";
import { useCallback, useEffect, useState } from "preact/hooks";

interface Props {
  initialBarriers: Barrier[];
  companyName: string;
  apiMode: "mock" | "http";
  apiBaseUrl: string;
  vocabularies: Vocabularies | null;
}

// DashboardView: picks the data mode; splash, settings, and sections live
// in the mode views below so hooks never run conditionally.
export function DashboardView(
  { initialBarriers, companyName, apiMode, apiBaseUrl, vocabularies }: Props,
) {
  const { settings } = useSettings();
  if (apiMode === "http") {
    return (
      <ServerView
        baseUrl={apiBaseUrl}
        vocabularies={vocabularies}
        companyName={companyName}
        defaultLocation={settings.defaultLocation}
      />
    );
  }
  return (
    <ClientView
      barriers={initialBarriers}
      companyName={companyName}
      defaultLocation={settings.defaultLocation}
    />
  );
}

// ClientView: mock-mode dashboard over the SSR'd barrier list.
function ClientView(
  { barriers, companyName, defaultLocation }: {
    barriers: Barrier[];
    companyName: string;
    defaultLocation: string;
  },
) {
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  // handleLoadDone: exits LoadingScreen then fades the shell in via rAF + short delay; stable callback for LoadingScreen onDone.
  const handleLoadDone = useCallback(() => {
    setLoading(false);
    // Short delay then fade in — smoother than instant
    requestAnimationFrame(() => setTimeout(() => setVisible(true), 30));
  }, []);

  const dash = useDashboard(barriers, defaultLocation);
  const { dispOpts, confOpts, catOpts } = useDashboardVocabularies(barriers);

  return (
    <>
      {loading && (
        <LoadingScreen onDone={handleLoadDone} companyName={companyName} />
      )}
      <DashboardSections
        dash={dash}
        barriers={barriers}
        dispOpts={dispOpts}
        confOpts={confOpts}
        catOpts={catOpts}
        visible={visible}
        loading={loading}
        companyName={companyName}
      />
    </>
  );
}

// ServerView: HTTP-mode dashboard paging from the API per scope change.
function ServerView(
  { baseUrl, vocabularies, companyName, defaultLocation }: {
    baseUrl: string;
    vocabularies: Vocabularies | null;
    companyName: string;
    defaultLocation: string;
  },
) {
  const [splashDone, setSplashDone] = useState(false);
  const [shown, setShown] = useState(false);
  const dash = useServerDashboard(baseUrl, defaultLocation);
  const { loading, error, retry, rows } = dash;

  // Fade the shell in once the first scope resolves; later refetches keep
  // showing stale data instead of flashing the splash on every keystroke.
  useEffect(() => {
    if (!loading && !error) setShown(true);
  }, [loading, error]);
  const firstLoad = loading && rows.length === 0 && !splashDone;

  if (error && rows.length === 0) {
    return <ServerErrorCard error={error} retry={retry} />;
  }

  return (
    <>
      {firstLoad && (
        <LoadingScreen
          onDone={() => setSplashDone(true)}
          companyName={companyName}
        />
      )}
      {error && <ServerErrorBanner error={error} retry={retry} />}
      <DashboardSections
        dash={dash}
        barriers={[]}
        stations={vocabularies?.locations}
        total={dash.filteredTotal}
        dispOpts={vocabularies?.disponibilidades ?? []}
        confOpts={vocabularies?.conformidades ?? []}
        catOpts={vocabularies?.categorias ?? []}
        visible={shown}
        loading={loading}
        companyName={companyName}
      />
    </>
  );
}
