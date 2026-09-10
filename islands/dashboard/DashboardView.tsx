// DashboardView - mode switch between client and server data views.
// Why: mock mode aggregates the SSR'd list in the browser; HTTP mode pages
// from the API. Both render the shared DashboardSections tree.
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
    return (
      <div
        role="alert"
        className="glass-card"
        style={{
          maxWidth: 520,
          margin: "15vh auto",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "var(--d-lead)",
            fontWeight: 700,
            color: "var(--alert-nc-text)",
            marginBottom: 8,
          }}
        >
          Falha ao carregar dados
        </div>
        <div
          style={{
            fontSize: "var(--d-small)",
            color: "var(--text-muted)",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
        <button
          type="button"
          onClick={retry}
          className="lift"
          style={{
            padding: "var(--d-btn-pad)",
            fontSize: "var(--d-small)",
            fontWeight: 700,
            borderRadius: 7,
            cursor: "pointer",
            border: "1px solid var(--accent)",
            background: "transparent",
            color: "var(--accent)",
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      {firstLoad && (
        <LoadingScreen
          onDone={() => setSplashDone(true)}
          companyName={companyName}
        />
      )}
      {error && (
        <div
          role="alert"
          style={{
            maxWidth: 1400,
            margin: "0 auto var(--d-bar-gap) auto",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: "var(--d-small)",
            color: "#f87171",
            border: "1px solid rgba(248,113,113,.4)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={retry}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
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
