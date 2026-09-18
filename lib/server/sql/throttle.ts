// DB throttle - Postgres-backed fixed-window rate limiter shared across isolates.
// This is why it exists: the in-memory throttle splits budgets per isolate;
// this table shares one budget. Callers fall back to memory when the DB is
// unreachable so rate limiting never breaks the request path.
import type { ThrottleDecision } from "../throttle.ts";

import { queryRows } from "../db.ts";

// checkDbThrottle: atomically increments the (bucket, key) window. Returns
// allowed=false with retryAfterMs when the limit is exceeded.
export async function checkDbThrottle(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<ThrottleDecision> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs).toISOString();
  const rows = await queryRows<{ count: string; reset_at: string }>(
    `insert into throttle_buckets (bucket, key, count, reset_at)
     values ($1, $2, 1, $3)
     on conflict (bucket, key) do update set
       count = case when throttle_buckets.reset_at <= now() then 1
         else throttle_buckets.count + 1 end,
       reset_at = case when throttle_buckets.reset_at <= now() then $3
         else throttle_buckets.reset_at end
     returning count::text as count, reset_at::text as reset_at`,
    [bucket, key, resetAt],
  );
  const count = Number(rows[0]?.count ?? limit + 1);
  if (count <= limit) return { allowed: true, retryAfterMs: 0 };
  const resetMs = new Date(rows[0]?.reset_at ?? resetAt).getTime();
  return { allowed: false, retryAfterMs: Math.max(0, resetMs - now) };
}
