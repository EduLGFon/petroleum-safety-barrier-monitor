// Home route - renders the barrier monitor with server-loaded data.
// This is why it exists: Fresh port of the Next page; mock mode SSR's the
// full list for instant client aggregation, HTTP mode SSR's only filter
// vocabularies while pages load per scope from the API (50k+ rows never
// ship as island props). Providers live inside the Dashboard island
// (context does not cross the island boundary on the client). The shell
// stays transparent so the Aurora mesh canvas paints edge to edge.
import { getVocabularies } from "../lib/server/sql/vocabularies.ts";
import { Dashboard } from "../islands/Dashboard.tsx";
import { getCompanyName } from "../lib/company.ts";
import type { Vocabularies } from "../lib/types.ts";
import { define } from "../utils.ts";
import { api } from "../lib/api.ts";

// Reads server env (islands cannot: no Deno in the browser, so mode and base
// URL cross the island boundary as props instead of env reads).
function getApiMode(): "mock" | "http" {
  try {
    return Deno.env.get("PUBLIC_API_MODE") === "http" ? "http" : "mock";
  } catch {
    return "mock";
  }
}

// Home page: server-loads the dashboard seed (list or vocabularies by mode)
// plus company name for the Dashboard island.
export default define.page(async function Home() {
  const apiMode = getApiMode();
  const companyName = getCompanyName();
  if (apiMode === "http") {
    const baseUrl = (() => {
      try {
        return Deno.env.get("PUBLIC_API_BASE_URL") ?? "";
      } catch {
        return "";
      }
    })();
    const vocabularies: Vocabularies = await getVocabularies();
    return (
      <main
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "var(--d-shell)",
          background: "transparent",
          minHeight: "100vh",
        }}
      >
        <Dashboard
          initialBarriers={[]}
          companyName={companyName}
          apiMode="http"
          apiBaseUrl={baseUrl}
          vocabularies={vocabularies}
        />
      </main>
    );
  }
  const barriers = await api.getAllBarriers({});
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: "var(--d-shell)",
        background: "transparent",
        minHeight: "100vh",
      }}
    >
      <Dashboard
        initialBarriers={barriers}
        companyName={companyName}
        apiMode="mock"
        apiBaseUrl=""
        vocabularies={null}
      />
    </main>
  );
});
