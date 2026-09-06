// Home route - renders the barrier monitor with server-loaded data.
// This is why it exists: Fresh port of the Next page; data loads on the
// server via the mock adapter and the island hydrates it in the browser.
import { Dashboard } from "../islands/Dashboard.tsx";
import { mockApi } from "../lib/api.ts";
import { SettingsProvider } from "../context/SettingsContext.tsx";
import { ThemeProvider } from "../context/ThemeContext.tsx";
import { define } from "../utils.ts";

export default define.page(async function Home() {
  const barriers = await mockApi.getAllBarriers({});
  return (
    <SettingsProvider>
      <ThemeProvider>
        <main
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "20px 18px 40px",
            background: "var(--bg-page)",
            minHeight: "100vh",
          }}
        >
          <Dashboard initialBarriers={barriers} />
          <footer
            style={{
              marginTop: 28,
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            Seacrest Petroleo - Monitor de Barreiras de Seguranca
          </footer>
        </main>
      </ThemeProvider>
    </SettingsProvider>
  );
});
