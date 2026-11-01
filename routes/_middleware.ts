// Root middleware - cache policy for hashed assets + gzip for JSON/CSV.
// This is why it exists: staticFiles() ships no Cache-Control options and
// no response compression, so every deploy revalidated hashed bundles and
// every 25-100-row JSON page (plus CSV exports) rode the wire uncompressed.
// The middleware post-processes responses only: document routes pass
// through untouched, API JSON/CSV gains Content-Encoding when the client
// accepts it, and immutable assets gain a year-long TTL.
import { define } from "../utils.ts";

function isImmutableAsset(pathname: string): boolean {
  return pathname.startsWith("/_frsh/") ||
    pathname.startsWith("/static/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico";
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
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: next,
      });
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
      return new Response(stream, {
        status: res.status,
        statusText: res.statusText,
        headers: next,
      });
    }
  } catch {
    // Header/body post-processing must never fail a request.
  }
  return res;
});
