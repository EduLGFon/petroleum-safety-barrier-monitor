// Session tokens - opaque cookies over SHA-256 hashes, no JWT library.
// This is why it exists: islands cannot hold secrets, so the browser keeps an
// opaque random token while Postgres stores only its hash. Stealing the DB
// alone never yields a usable cookie, and revocation is a row delete.
export const SESSION_COOKIE = "barrier_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// createSessionToken: 32 random bytes as hex (64 chars, URL-safe in Cookie).
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// hashSessionToken: SHA-256 hex of the opaque token for storage.
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// sessionExpiry: now + TTL, used at login and stored in sessions.expires_at.
export function sessionExpiry(now = Date.now()): Date {
  return new Date(now + SESSION_TTL_MS);
}

// getSessionTokenFromRequest: parses the Cookie header for our cookie name.
export function getSessionTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = part.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (value) return decodeURIComponent(value);
  }
  return null;
}

// buildSessionCookie: Set-Cookie value for a fresh login.
export function buildSessionCookie(
  token: string,
  expires: Date,
  isSecure: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
  ];
  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

// buildExpiredCookie: Set-Cookie value that clears the session on logout.
export function buildExpiredCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// appBaseUrlIsHttps: APP_BASE_URL is the public site URL. Behind a TLS
// terminating proxy the upstream request is plain http:// even though the
// browser is on https://, so the request protocol alone would drop Secure.
function appBaseUrlIsHttps(appBaseUrl: string | undefined): boolean {
  let value = appBaseUrl;
  if (value === undefined) {
    try {
      value = Deno.env.get("APP_BASE_URL") ?? "";
    } catch {
      value = "";
    }
  }
  return value.trim().toLowerCase().startsWith("https://");
}

// isSecureRequest: Secure cookies over https, including deployments behind a
// TLS-terminating reverse proxy whose upstream request is plain http. The
// optional appBaseUrl keeps the proxy decision testable without env access.
export function isSecureRequest(
  req: Request,
  appBaseUrl?: string,
): boolean {
  try {
    if (new URL(req.url).protocol === "https:") return true;
  } catch {
    // Fall through to the configured public URL.
  }
  return appBaseUrlIsHttps(appBaseUrl);
}
