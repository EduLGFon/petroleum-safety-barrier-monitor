// Admin route - camouflaged management console.
// This is why it exists: the console's very existence is hidden from
// strangers (anonymous visitors get a bare 404, same as a missing page).
// Dead cookies redirect to /login with ?next=/admin; authenticated users
// render the island, which keeps its own role check for non-admins.
import { requirePageSession, toLogin } from "../lib/server/page-auth.ts";

import { camouflage } from "../lib/server/page-auth.ts";

import { AdminPanel } from "../islands/AdminPanel.tsx";

import { define } from "../utils.ts";

export default define.page(async function Admin(
  { url, req }: { url: URL; req: Request },
) {
  const session = await requirePageSession(req);
  if (session.state === "anonymous") return camouflage();
  if (session.state === "expired") return toLogin(url);
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
