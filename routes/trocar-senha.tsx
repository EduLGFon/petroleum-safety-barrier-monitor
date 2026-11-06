// Route: /trocar-senha - the holding screen for an account that still
// carries the password the system generated.
// This is why it exists: the gate lives in the API guards, so a pending
// account gets 403 everywhere. This page is the single exception, and the
// redirect below keeps it from becoming a second, optional way in - whoever
// is not pending is sent back to the dashboard.
import { requirePageSession, toLogin } from "../lib/server/page-auth.ts";

import { ForcePasswordChange } from "../islands/ForcePasswordChange.tsx";

import { getCompanyName } from "../lib/company.ts";

import { define } from "../utils.ts";

export default define.page(async function TrocarSenha(
  { url, req }: { url: URL; req: Request },
) {
  const session = await requirePageSession(req);
  if (session.state !== "authenticated") return toLogin(url);
  const user = session.user;
  // An Entra account has no password to change: it belongs on the dashboard,
  // not here. Without this it would bounce between / and this page.
  if (!user?.mustChangePassword || user.authSource !== "local") {
    return new Response(null, { status: 303, headers: { location: "/" } });
  }
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--d-shell, 24px)",
      }}
    >
      <section
        style={{
          width: "min(420px, 100%)",
          display: "grid",
          gap: 16,
          padding: 24,
          borderRadius: 12,
          border: "1px solid var(--border, #334155)",
        }}
      >
        <header style={{ display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 18 }}>Troque sua senha</strong>
          <span style={{ opacity: 0.7, fontSize: 13 }}>
            {getCompanyName()}
          </span>
        </header>
        <ForcePasswordChange email={user.email} />
      </section>
    </main>
  );
});
