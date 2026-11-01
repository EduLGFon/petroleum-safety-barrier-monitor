// CSRF guard - Origin / Sec-Fetch-Site check for state-changing routes.
// This is why it exists: cookie-session POST/PATCH/PUT/DELETE must not be
// callable cross-site (a planted form on an evil origin would otherwise ride
// the victim's session cookie). Same-origin fetches, direct navigations and
// non-browser callers (no Origin/Sec-Fetch-Site headers) are allowed; only
// an explicit cross-site signal is denied.
import { forbidden } from "./errors.ts";

// SAFE_METHODS: read-only verbs never need the check.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// isSameOriginRequest: true when the request shows no cross-site signal.
// Allows: same-origin / same-site / none Sec-Fetch-Site, matching Origin vs
// Host, or no signal at all (curl/tests/same-origin without Origin header).
export function isSameOriginRequest(req: Request): boolean {
  const method = (req.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  const site = req.headers.get("sec-fetch-site")?.toLowerCase().trim() ?? "";
  if (site === "cross-site" || site === "cross_site") {
    // Explicit cross-site fetch: deny unless Origin matches Host anyway
    // (some proxies mislabel). Fall through to the Origin check.
    const origin = req.headers.get("origin");
    if (!origin) return false;
    return originMatchesHost(req, origin);
  }
  if (
    site === "same-origin" || site === "same-site" || site === "none" ||
    site === ""
  ) {
    const origin = req.headers.get("origin");
    if (!origin) return true;
    return originMatchesHost(req, origin);
  }
  // Unknown Sec-Fetch-Site value: fall back to the Origin check when an
  // Origin is present, otherwise allow (no evidence of forgery).
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return originMatchesHost(req, origin);
}

// isSameOrigin: alias kept for callers importing either name.
export function isSameOrigin(req: Request): boolean {
  return isSameOriginRequest(req);
}

// originMatchesHost: Origin host (incl. port) equals the request Host.
function originMatchesHost(req: Request, origin: string): boolean {
  try {
    const o = new URL(origin);
    const host = req.headers.get("host") ??
      req.headers.get("x-forwarded-host") ?? "";
    if (host) return o.host.toLowerCase() === host.toLowerCase();
    return o.host.toLowerCase() === new URL(req.url).host.toLowerCase();
  } catch {
    return false;
  }
}

// denyIfCrossSite: returns a 403 response when the request carries an
// explicit cross-site signal, null when the request may proceed.
export function denyIfCrossSite(
  req: Request,
  requestId: string,
): Response | null {
  if (isSameOriginRequest(req)) return null;
  return forbidden("cross-site request denied", requestId);
}

// requireSameOrigin: alias kept for callers importing either name.
export function requireSameOrigin(
  req: Request,
  requestId: string,
): Response | null {
  return denyIfCrossSite(req, requestId);
}

// checkCsrf: boolean-only alias for unit tests.
export function checkCsrf(req: Request): boolean {
  return isSameOriginRequest(req);
}
