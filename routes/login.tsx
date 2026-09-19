// Login route - the only public page (immersive credential screen).
// This is why it exists: session login lives outside the Dashboard island
// so logged-out users never download the monitor bundle just to sign in.
// Already-authenticated visitors bounce straight to their return target.
import { requirePageSession, safeNext } from "../lib/server/page-auth.ts";

import { LoginShell } from "../components/login/LoginShell.tsx";

import { LoginForm } from "../islands/LoginForm.tsx";

import { getCompanyName } from "../lib/company.ts";

import { define } from "../utils.ts";

export default define.page(async function Login(
  { url, req }: { url: URL; req: Request },
) {
  const session = await requirePageSession(req);
  if (session.state === "authenticated") {
    const next = safeNext(url.searchParams.get("next"));
    return Response.redirect(new URL(next, url), 302);
  }
  const companyName = getCompanyName();
  return (
    <LoginShell>
      <LoginForm companyName={companyName} />
    </LoginShell>
  );
});
