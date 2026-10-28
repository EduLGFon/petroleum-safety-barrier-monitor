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
        phone: user.phone ?? "",
        role: user.role,
        allowedLocationIds: user.allowedLocationIds,
        authSource: user.auth_source,
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

// safeAuthNext: stricter return-target validation for SSO flows. It rejects
// auth, API, and login paths in addition to the usual open-redirect checks.
export function safeAuthNext(
  raw: string | null,
  appBaseUrl?: string,
  fallback = "/",
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (value === "" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  if (value.length > 2048) return fallback;
  let hasControl = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      hasControl = true;
      break;
    }
  }
  if (value.includes("\\") || hasControl) {
    return fallback;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  const pathOnly = value.split("?")[0].split("#")[0];
  if (
    pathOnly === "/login" || pathOnly.startsWith("/login/") ||
    pathOnly.startsWith("/auth/") || pathOnly.startsWith("/api/")
  ) {
    return fallback;
  }
  if (appBaseUrl) {
    try {
      const base = new URL(appBaseUrl);
      const target = new URL(value, appBaseUrl);
      if (target.origin !== base.origin) return fallback;
    } catch {
      return fallback;
    }
  }
  return value;
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
