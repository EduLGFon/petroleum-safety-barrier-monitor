// Dashboard island - interactive monitor wired to filters, table and exports.
// This is why it exists: the only hydrated root; everything static stays
// in components/ so the client ships JS for this subtree alone.
import { SettingsProvider } from "../context/SettingsContext.tsx";
import { DashboardView } from "./dashboard/DashboardView.tsx";
import { ThemeProvider } from "../context/ThemeContext.tsx";
import type { Barrier } from "../lib/types.ts";

interface Props {
  initialBarriers: Barrier[];
  companyName: string;
}

// Dashboard: island root; wraps DashboardView in Settings + Theme providers since server route context does not reach hydrated islands.
export function Dashboard({ initialBarriers, companyName }: Props) {
  // Providers must wrap the island content itself: context from a server
  // route does not reach island code when it hydrates in the browser.
  return (
    <SettingsProvider>
      <ThemeProvider>
        <DashboardView
          initialBarriers={initialBarriers}
          companyName={companyName}
        />
      </ThemeProvider>
    </SettingsProvider>
  );
}
