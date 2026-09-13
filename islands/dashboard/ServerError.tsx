// Server fetch error UI - full-page card and inline banner with retry.
// Why: server mode fails over HTTP; both states share styling and the retry
// affordance instead of duplicating markup in the view.
interface ErrorProps {
  error: string;
  retry: () => void;
}

// ServerErrorCard: full-page failure with retry (shown when no rows loaded).
export function ServerErrorCard({ error, retry }: ErrorProps) {
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

// ServerErrorBanner: inline strip keeping stale rows visible (retry inline).
export function ServerErrorBanner({ error, retry }: ErrorProps) {
  return (
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
  );
}
