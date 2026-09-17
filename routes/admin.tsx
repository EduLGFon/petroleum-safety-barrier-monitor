// Admin route - renders the management console island.
// This is why it exists: user, recipient, and alert-rule management needs a
// dedicated page outside the dashboard grid; the island itself guards the
// admin role via /api/auth/me.
import { AdminPanel } from "../islands/AdminPanel.tsx";
import { define } from "../utils.ts";

export default define.page(function Admin() {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "var(--d-shell)",
        minHeight: "100vh",
      }}
    >
      <AdminPanel />
    </main>
  );
});
