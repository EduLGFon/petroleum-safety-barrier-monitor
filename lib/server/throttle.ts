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

  return {
    check(key: string): ThrottleDecision {
      const at = now();
      const bucket = buckets.get(key);
      if (bucket === undefined || at >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: at + windowMs });
        if (buckets.size > 10_000) {
          for (const [k, b] of buckets) {
            if (at >= b.resetAt) buckets.delete(k);
          }
        }
        return { allowed: true, retryAfterMs: 0 };
      }
      if (bucket.count < limit) {
        bucket.count++;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: bucket.resetAt - at };
    },
  };
}

// Route buckets: reads are generous, writes and the export (DB-heavy) are
// tight. Singletons per isolate - Deno serve runs one isolate locally, so
// the counters are process-wide without any shared store. Multi-isolate
// deploys should prefer lib/server/sql/throttle.ts (shared table); the
// export route already does DB-first with this module as fallback.
export const readThrottle = createThrottle({ limit: 120, windowMs: 60_000 });
export const writeThrottle = createThrottle({ limit: 30, windowMs: 60_000 });
export const exportThrottle = createThrottle({ limit: 10, windowMs: 60_000 });

// routeClientKey: extracts the client identity from a Fresh route context
// without importing Fresh types (unknown in, string out). Falls back to
// "unknown" when the shape is unexpected - throttled as one shared bucket
// rather than crashing the request.
export function routeClientKey(ctx: unknown): string {
  if (typeof ctx === "object" && ctx !== null && "info" in ctx) {
    const info = (ctx as { info?: unknown }).info;
    if (typeof info === "object" && info !== null && "remoteAddr" in info) {
      return throttleKey((info as { remoteAddr?: unknown }).remoteAddr);
    }
  }
  return "unknown";
}

// throttleKey: client identity for a request. Remote address only - never
// X-Forwarded-For, which any client can spoof into someone else's bucket.
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
