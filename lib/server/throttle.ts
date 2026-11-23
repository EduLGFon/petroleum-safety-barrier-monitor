// Throttle - Deno-native in-memory fixed-window rate limiter, no deps.
// This is why it exists: public GETs and the CSV export are cheap per call
// but unbounded per client; a Map of counters is enough at this scale, and
// keeping it dependency-free means one less service to operate.
export interface ThrottleOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface ThrottleDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// createThrottle: fixed window per key. now is injectable so tests never
// sleep; the lazy sweep keeps the map bounded without a timer.
export interface Throttle {
  check(key: string): ThrottleDecision;
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const { limit, windowMs, now = () => Date.now() } = options;
  const buckets = new Map<string, Bucket>();

  // evictExpired: drops windows whose reset already passed so a burst of
  // distinct keys cannot pin dead entries. Runs only when the map exceeds
  // the cap, keeping the steady-state check O(1).
  const evictIfNeeded = (at: number): void => {
    if (buckets.size <= 5000) return;
    for (const [k, b] of buckets) {
      if (at >= b.resetAt) buckets.delete(k);
      if (buckets.size <= 5000) return;
    }
    // Still over budget (all entries live): evict oldest first. Map
    // iteration order is insertion order, and hits refresh recency below,
    // so the head is the least-recently-used key. Warn so operators notice
    // the 5000-key upper bound being exceeded by live buckets.
    console.warn(
      `throttle: evicting live (non-expired) bucket; map at ${buckets.size} keys (cap 5000)`,
    );
    while (buckets.size > 5000) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  };

  return {
    check(key: string): ThrottleDecision {
      const at = now();
      const bucket = buckets.get(key);
      // Expiry on read: a passed window resets on next touch, no timer needed.
      if (bucket === undefined || at >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: at + windowMs });
        evictIfNeeded(at);
        return { allowed: true, retryAfterMs: 0 };
      }
      // Refresh LRU recency on hit so the cap above evicts cold keys first.
      buckets.delete(key);
      buckets.set(key, bucket);
      if (bucket.count < limit) {
        bucket.count++;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - at) };
    },
  };
}

// Route buckets: reads are generous, writes and the export (DB-heavy) are
// tighter. Singletons per isolate - Deno serve runs one isolate locally, so
// the counters are process-wide without any shared store. Multi-isolate
// deploys should prefer lib/server/sql/throttle.ts (shared table); the
// export route already does DB-first with this module as fallback.
export const readThrottle = createThrottle({ limit: 120, windowMs: 60_000 });
export const writeThrottle = createThrottle({ limit: 30, windowMs: 60_000 });
// Export: one request per file, but a PDF export is one request per print
// part, so the bucket has to fit a whole multi-part export (100 parts for a
// 200k-row selection) without throttling the export it is protecting.
export const exportThrottle = createThrottle({ limit: 120, windowMs: 60_000 });
// passwordThrottle: self-service password changes carry a current-password
// oracle (wrong guesses probe the real password), so they get the tightest
// write bucket even though the caller is already authenticated.
export const passwordThrottle = createThrottle({
  limit: 10,
  windowMs: 60_000,
});
// Raw Fracttal detail can fan out to eleven upstream GETs per click.
export const fracttalRawThrottle = createThrottle({
  limit: 5,
  windowMs: 60_000,
});

// isLoopbackHost: true for the proxy address used by the documented Caddy
// deployment and local development.
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" ||
    h === "[::1]";
}

// trustedProxyHosts: loopback plus optional comma-separated
// TRUSTED_PROXY_IPS entries. Only a request arriving from one of these may
// contribute an edge-injected client address.
function trustedProxyHosts(): Set<string> {
  const out = new Set(["127.0.0.1", "::1", "localhost", "[::1]"]);
  try {
    const raw = Deno.env.get("TRUSTED_PROXY_IPS") ?? "";
    for (const item of raw.split(",")) {
      const host = item.trim().toLowerCase();
      if (host !== "") out.add(host);
    }
  } catch {
    // No env access (tests): loopback only.
  }
  return out;
}

// isIpv4: four dotted decimal octets, each 0-255 and without leading
// zeros (a padded octet is read differently by different parsers, so it is
// not an address the app should key on).
function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    const n = Number(part);
    if (!Number.isSafeInteger(n) || n > 255) return false;
  }
  return true;
}

// isIpv6: colon-separated hex groups. At most one "::" (which stands for
// at least one zero group) and an optional embedded IPv4 tail.
function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  const marker = value.indexOf("::");
  if (marker !== -1 && marker !== value.lastIndexOf("::")) return false;
  const head = marker === -1 ? value : value.slice(0, marker);
  const tail = marker === -1 ? "" : value.slice(marker + 2);
  // count: groups of one part, or null when the part is malformed. An
  // embedded IPv4 counts as two groups and is only legal as the last group
  // of the whole address, so "::1.2.3.4:5" and "1.2.3.4::" are rejected.
  const count = (part: string, ipv4Allowed: boolean): number | null => {
    if (part === "") return 0;
    const groups = part.split(":");
    let total = 0;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group === "") return null;
      if (group.includes(".")) {
        const isLast = i === groups.length - 1;
        if (!ipv4Allowed || !isLast || !isIpv4(group)) return null;
        total += 2;
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      total += 1;
    }
    return total;
  };
  // With "::" the head is followed by the tail, so only the tail may end in
  // an embedded IPv4; without it the whole address may.
  const headCount = count(head, marker === -1);
  const tailCount = count(tail, true);
  if (headCount === null || tailCount === null) return false;
  // Without "::" every group must be present; with it the written groups
  // must leave room for at least one zero group.
  return marker === -1 ? headCount === 8 : headCount + tailCount <= 7;
}

// isIpLiteral: narrow shape check before trusting an edge header as a
// bucket key. Only a real IPv4 or IPv6 address is accepted - hostnames,
// partial addresses and punctuation are not.
export function isIpLiteral(value: string): boolean {
  const v = value.trim();
  if (v === "") return false;
  if (v.includes(":")) return isIpv6(v);
  return isIpv4(v);
}

// routeClientKey: extracts the client identity from a Fresh route context
// without importing Fresh types (unknown in, string out). Behind the
// documented proxy the socket peer is loopback, so an edge-injected
// X-Real-IP (or the first X-Forwarded-For hop) is used only when the peer
// is a trusted proxy. Direct clients can never spoof another bucket.
export function routeClientKey(ctx: unknown): string {
  let remote = "unknown";
  if (typeof ctx === "object" && ctx !== null && "info" in ctx) {
    const info = (ctx as { info?: unknown }).info;
    if (typeof info === "object" && info !== null && "remoteAddr" in info) {
      remote = throttleKey((info as { remoteAddr?: unknown }).remoteAddr);
    }
  }
  if (!trustedProxyHosts().has(remote)) return remote;
  if (typeof ctx === "object" && ctx !== null && "req" in ctx) {
    const req = (ctx as { req?: unknown }).req;
    if (req instanceof Request) {
      const real = req.headers.get("x-real-ip")?.trim() ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (real !== undefined && isIpLiteral(real)) return real;
    }
  }
  return remote;
}

// throttleKey: client identity for a request. Remote address only - never
// X-Forwarded-For, which any client can spoof into someone else's bucket.
// Proxy note: deployments sit behind a TLS-terminating reverse proxy
// (Caddy, see deploy/windows/Caddyfile) that forwards to loopback :8300.
// Deno's remoteAddr is then the proxy's address, so all clients share one
// bucket unless the proxy injects a trusted client IP that the app reads.
// That header is deliberately NOT read here: X-Forwarded-For is
// client-controlled on a direct connection and would let one client evict
// another's bucket or dodge its own limit. If per-client limits behind a
// proxy are required, terminate the proxy with a fixed, authenticated
// `X-Real-IP`-style header stripped at the edge and key on it explicitly -
// or prefer lib/server/sql/throttle.ts, which shares one budget across
// isolates instead of one bucket per isolate.
export function throttleKey(remoteAddr: unknown): string {
  if (
    typeof remoteAddr === "object" && remoteAddr !== null &&
    "hostname" in remoteAddr
  ) {
    const host = (remoteAddr as { hostname?: unknown }).hostname;
    if (typeof host === "string" && host !== "") return host;
  }
  return "unknown";
}
