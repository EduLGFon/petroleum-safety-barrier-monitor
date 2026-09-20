// Page auth - session gates for Fresh page routes (Login => Dashboard).
// This is why it exists: islands cannot gate themselves (they hydrate after
// SSR ships data), so every page resolves the cookie session server-side:
// anonymous visitors get 404 camouflage everywhere except /login, holders
// of dead cookies get a login redirect that returns them via ?next=.
import { getSessionTokenFromRequest } from "./auth/session.ts";

import { hashSessionToken } from "./auth/session.ts";

import { getSessionUser } from "./sql/sessions.ts";

import type { AuthUser } from "../types.ts";

import { hasCredentials } from "./auth.ts";

export type PageSession =
  | { state: "authenticated"; user: AuthUser }
  | { state: "anonymous" }
  | { state: "expired" };

// requirePageSession: resolves the request cookie to a page verdict without
// ever throwing (DB down reads as expired, which redirects to login rather
// than leaking a 500 with or without data).
export async function requirePageSession(req: Request): Promise<PageSession> {
  try {
    if (!hasCredentials(req)) return { state: "anonymous" };
    const raw = getSessionTokenFromRequest(req);
    if (!raw) return { state: "anonymous" };
    const user = await getSessionUser(await hashSessionToken(raw));
    if (!user || !user.active) return { state: "expired" };
    return {
      state: "authenticated",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  } catch {
    return { state: "expired" };
  }
}

// safeNext: validates a post-login return target. Only same-origin absolute
// paths qualify (rejects protocol-relative, schemes and backslashes); the
// admin console additionally requires an admin role at its own gate.
export function safeNext(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return fallback;
  }
  return raw;
}

// camouflage: generic 404 with no product hints for anonymous visitors.
export function camouflage(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// toLogin: 302 to /login preserving the current page for a post-login return.
export function toLogin(url: URL): Response {
  const next = encodeURIComponent(`${url.pathname}${url.search}`);
  return Response.redirect(new URL(`/login?next=${next}`, url), 302);
}
