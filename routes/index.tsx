// Home route - renders the barrier monitor with server-loaded data.
// This is why it exists: Fresh port of the Next page; data loads on the
// server via the mock adapter. Providers live inside the Dashboard island
// (context does not cross the island boundary on the client).
import { Dashboard } from "../islands/Dashboard.tsx";
import { mockApi } from "../lib/api.ts";
import { getCompanyName, withBrand } from "../lib/company.ts";
import { define } from "../utils.ts";

export default define.page(async function Home() {
  const barriers = await mockApi.getAllBarriers({});
  const companyName = getCompanyName();
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: "20px 18px 40px",
        background: "var(--bg-page)",
        minHeight: "100vh",
      }}
    >
      <Dashboard initialBarriers={barriers} companyName={companyName} />
      <footer
        style={{
          marginTop: 28,
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {withBrand(companyName, "Monitor de Barreiras de Segurança")}
      </footer>
    </main>
  );
});
