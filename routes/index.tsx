// Home route - authenticated barrier monitor with server-loaded data.
// This is why it exists: Login => Dashboard, so the session gate runs
// before any data load. Logged-out visitors redirect to /login with ?next=
// for a post-login return. No data ever ships to strangers.
import { requirePageSession, toLogin } from "../lib/server/page-auth.ts";

import { getVocabularies } from "../lib/server/sql/vocabularies.ts";

import { Dashboard } from "../islands/Dashboard.tsx";

import type { Vocabularies } from "../lib/types.ts";

import { getCompanyName } from "../lib/company.ts";

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

// Home page: gates the session, then server-loads the dashboard seed (list
// or vocabularies by mode) plus company name for the Dashboard island.
// The shell spans the whole viewport on purpose: a max-width cap left the
// table, KPI band and charts stranded in the middle of a 24" monitor, and
// every section below is fluid (auto-fit grids, the chart measures its
// column), so the dashboard simply uses the space it is given.
const PAGE_STYLE = {
  margin: "0 auto",
  padding: "var(--d-shell)",
  background: "transparent",
  minHeight: "100vh",
} as const;

export default define.page(async function Home(
  { url, req }: { url: URL; req: Request },
) {
  const session = await requirePageSession(req);
  // Logged-out visitors go to /login (with a return ticket); only
  // authenticated sessions ever reach the data loads below.
  if (session.state !== "authenticated") return toLogin(url);
  const apiMode = getApiMode();
  const companyName = getCompanyName();
  const sessionUser = session.user;
  if (apiMode === "http") {
    // Empty PUBLIC_API_BASE_URL means "same origin": the island fetches
    // relative /api/* paths, so each browser uses the host it actually
    // typed. Never bake url.origin in here - behind a TLS-terminating proxy
    // the request URL is http:// while the page is https://, and an
    // absolute cross-origin base also drops the session cookie
    // (credentials: same-origin). Set the variable explicitly only when the
    // API really lives on another origin (that origin then needs CORS).
    const baseUrl = (() => {
      try {
        return Deno.env.get("PUBLIC_API_BASE_URL")?.trim() || "";
      } catch {
        return "";
      }
    })();
    const vocabularies: Vocabularies = await getVocabularies();
    return (
      <main style={PAGE_STYLE}>
        <Dashboard
          initialBarriers={[]}
          companyName={companyName}
          apiMode="http"
          apiBaseUrl={baseUrl}
          vocabularies={vocabularies}
          sessionUser={sessionUser}
        />
      </main>
    );
  }
  const barriers = await api.getAllBarriers(
    // Admins receive every row so the Situacao filter can list Desativada
    // and Excluida scopes client-side; everyone else gets the active view.
    sessionUser?.role === "admin" ? { rowScope: "all" } : {},
  );
  return (
    <main style={PAGE_STYLE}>
      <Dashboard
        initialBarriers={barriers}
        companyName={companyName}
        apiMode="mock"
        apiBaseUrl=""
        vocabularies={null}
        sessionUser={sessionUser}
      />
    </main>
  );
});
