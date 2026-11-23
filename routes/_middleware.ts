// Root middleware - cache policy for hashed assets + gzip for JSON/CSV.
// This is why it exists: staticFiles() ships no Cache-Control options and
// no response compression, so every deploy revalidated hashed bundles and
// every 25-100-row JSON page (plus CSV exports) rode the wire uncompressed.
// The middleware post-processes responses only: document routes pass
// through untouched, API JSON/CSV gains Content-Encoding when the client
// accepts it, immutable assets gain a year-long TTL, and the auth pages
// (/login, /trocar-senha) are marked no-store because they can carry a
// person's address or an SSO hand-off.
import { define } from "../utils.ts";

function isImmutableAsset(pathname: string): boolean {
  return pathname.startsWith("/_frsh/") ||
    pathname.startsWith("/static/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/boot.js" ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico";
}

// isPrivatePage: HTML documents that can carry a signed-in person's data,
// address, or SSO state. Fresh page components cannot attach headers
// themselves, so the middleware marks these responses private and uncacheable
// here. The dashboard root is included because it renders the authenticated
// workspace and must never be stored by a shared cache.
function isPrivatePage(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" ||
    pathname === "/trocar-senha";
}

// appendVary: add one request header to Vary without dropping an existing
// value or duplicating it case-insensitively.
function appendVary(headers: Headers, value: string): void {
  const current = headers.get("vary");
  if (!current) {
    headers.set("vary", value);
    return;
  }
  const has = current.split(",").some((part) =>
    part.trim().toLowerCase() === value.toLowerCase()
  );
  if (!has) headers.set("vary", `${current}, ${value}`);
}

function isCompressible(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  // JSON pages + CSV streams compress 5-10x. xlsx (zip) and PDF (deflated)
  // are already compressed: re-gzipping them wastes CPU for ~0 bytes.
  if (ct.includes("application/pdf")) return false;
  if (ct.includes("spreadsheet") || ct.includes("officedocument")) {
    return false;
  }
  if (ct.includes("zip") || ct.includes("octet-stream")) return false;
  return ct.includes("application/json") || ct.includes("text/csv") ||
    ct.includes("text/plain");
}

// applySecurityHeaders: app-level hardening that must survive deployments
// without the Caddy template. CSP is skipped in dev because Vite HMR needs
// eval/websocket; production uses the strict policy.
function applySecurityHeaders(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  const set = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  set("x-content-type-options", "nosniff");
  set("x-frame-options", "DENY");
  set("referrer-policy", "no-referrer");
  set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  let dev = false;
  try {
    dev = Deno.env.get("DEV") === "true";
  } catch {
    // No env access: use the production policy.
  }
  if (!dev) {
    set(
      "content-security-policy",
      // Fresh injects the hydration bootstrap inline with a nonce that is
      // not exposed to middleware; allow inline scripts (user data is
      // escaped everywhere) while keeping external script origins locked.
      "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  }
  let https = false;
  try {
    https = new URL(req.url).protocol === "https:";
  } catch {
    // Fall through to APP_BASE_URL.
  }
  if (!https) {
    try {
      https = (Deno.env.get("APP_BASE_URL") ?? "").toLowerCase().startsWith(
        "https://",
      );
    } catch {
      // No env access: leave HSTS off.
    }
  }
  if (https) {
    set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export const handler = define.middleware(async (ctx) => {
  const res = await ctx.next();
  try {
    const url = new URL(ctx.req.url);
    // Year-long immutable TTL for hashed build assets + static files.
    // Document routes (/, /login) and API fall through untouched.
    if (isImmutableAsset(url.pathname) && res.status === 200) {
      const next = new Headers(res.headers);
      if (!next.has("cache-control")) {
        next.set("cache-control", "public, max-age=31536000, immutable");
      }
      return applySecurityHeaders(
        ctx.req,
        new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: next,
        }),
      );
    }
    // Streaming gzip for compressible GET bodies when accepted.
    if (
      ctx.req.method === "GET" && res.status === 200 && res.body &&
      !res.headers.has("content-encoding") &&
      isCompressible(res.headers.get("content-type")) &&
      (ctx.req.headers.get("accept-encoding") ?? "").includes("gzip")
    ) {
      const next = new Headers(res.headers);
      next.set("content-encoding", "gzip");
      next.delete("content-length");
      const vary = next.get("vary");
      next.set(
        "vary",
        vary ? `${vary}, Accept-Encoding` : "Accept-Encoding",
      );
      const stream = res.body.pipeThrough(new CompressionStream("gzip"));
      return applySecurityHeaders(
        ctx.req,
        new Response(stream, {
          status: res.status,
          statusText: res.statusText,
          headers: next,
        }),
      );
    }
    // Private pages may render a user's email or an SSO hand-off, and the
    // dashboard root renders the authenticated workspace. They are never
    // shared-cacheable: private + no-store, and Vary: Cookie so any cache
    // still in front keys by session. API responses keep their own policy.
    if (isPrivatePage(url.pathname)) {
      const next = new Headers(res.headers);
      next.set("cache-control", "private, no-store");
      appendVary(next, "Cookie");
      return applySecurityHeaders(
        ctx.req,
        new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: next,
        }),
      );
    }
  } catch {
    // Header/body post-processing must never fail a request.
  }
  return applySecurityHeaders(ctx.req, res);
});
