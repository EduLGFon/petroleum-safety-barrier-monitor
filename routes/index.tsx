// Home route - renders the barrier monitor with server-loaded data.
// This is why it exists: Fresh port of the Next page; data loads on the
// server via the mock adapter. Providers live inside the Dashboard island
// (context does not cross the island boundary on the client). The shell
// stays transparent so the Aurora mesh canvas paints edge to edge.
import { Dashboard } from "../islands/Dashboard.tsx";
import { getCompanyName } from "../lib/company.ts";
import { mockApi } from "../lib/api.ts";
import { define } from "../utils.ts";

// Home page: server-loads barriers + company name for the Dashboard island.
export default define.page(async function Home() {
  const barriers = await mockApi.getAllBarriers({});
  const companyName = getCompanyName();
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
      <Dashboard initialBarriers={barriers} companyName={companyName} />
    </main>
  );
});
