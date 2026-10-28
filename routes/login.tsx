// Login route - the only public page (immersive credential screen).
// This is why it exists: session login lives outside the Dashboard island
// so logged-out users never download the monitor bundle just to sign in.
// Already-authenticated visitors bounce straight to their return target.
import {
  requirePageSession,
  safeAuthNext,
  safeNext,
} from "../lib/server/page-auth.ts";

import { LoginShell } from "../components/login/LoginShell.tsx";

import { LoginForm } from "../islands/LoginForm.tsx";

import { getCompanyName } from "../lib/company.ts";

import { loadAuthConfig } from "../lib/server/config.ts";

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
  let authConfig;
  try {
    authConfig = loadAuthConfig();
  } catch {
    authConfig = { localEnabled: true, ssoEnabled: false, entra: null };
  }
  const next = safeAuthNext(
    url.searchParams.get("next"),
    authConfig.entra?.appBaseUrl,
  );
  const ssoHref = authConfig.ssoEnabled
    ? `/auth/entra/login?next=${encodeURIComponent(next)}`
    : "";
  const ssoError = url.searchParams.get("sso");
  const allowedErrors = new Set([
    "denied",
    "expired",
    "no_access",
    "unavailable",
    "failed",
    "logout",
    "disabled",
  ]);
  return (
    <LoginShell>
      <LoginForm
        companyName={companyName}
        localEnabled={authConfig.localEnabled}
        ssoEnabled={authConfig.ssoEnabled}
        ssoHref={ssoHref}
        ssoError={ssoError && allowedErrors.has(ssoError) ? ssoError : null}
      />
    </LoginShell>
  );
});
