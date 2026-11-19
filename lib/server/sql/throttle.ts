// DB throttle - Postgres-backed fixed-window rate limiter shared across isolates.
// This is why it exists: the in-memory throttle splits budgets per isolate;
// this table shares one budget. Callers fall back to memory when the DB is
// unreachable so rate limiting never breaks the request path.
import type { ThrottleDecision } from "../throttle.ts";

import { queryRows } from "../db.ts";

// THROTTLE_UPSERT_SQL: one statement. Both the expiry comparison and the new
// window are computed from Postgres `now()`; using the app clock for reset_at
// while the upsert compared DB time let host/DB clock skew shift a window.
// retry_after_ms is returned from the DB too, so the caller never subtracts
// an app timestamp from a database timestamp.
export const THROTTLE_UPSERT_SQL = `
  insert into throttle_buckets (bucket, key, count, reset_at)
  values ($1, $2, 1, now() + ($3::int * interval '1 millisecond'))
  on conflict (bucket, key) do update set
    count = case when throttle_buckets.reset_at <= now() then 1
      else throttle_buckets.count + 1 end,
    reset_at = case when throttle_buckets.reset_at <= now()
      then now() + ($3::int * interval '1 millisecond')
      else throttle_buckets.reset_at end
  returning count::text as count,
    ceil(extract(epoch from (reset_at - now())) * 1000)::bigint as retry_after_ms
`;

// throttleDecision: pure mapping from the upsert row to the decision. Kept
// separate so the count/retry arithmetic is tested without a database.
export function throttleDecision(
  row:
    | { count: string | number; retry_after_ms: string | number | bigint }
    | undefined,
  limit: number,
  windowMs: number,
): ThrottleDecision {
  if (row === undefined) {
    // The upsert always returns a row; this is the defensive fallback and
    // must fail closed for one full window rather than allow the request.
    return { allowed: false, retryAfterMs: Math.max(0, Math.ceil(windowMs)) };
  }
  const count = Number(row.count);
  if (count <= limit) return { allowed: true, retryAfterMs: 0 };
  const retry = Number(row.retry_after_ms);
  return {
    allowed: false,
    retryAfterMs: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 0,
  };
}

// checkDbThrottle: atomically increments the (bucket, key) window. Returns
// allowed=false with retryAfterMs when the limit is exceeded.
export async function checkDbThrottle(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<ThrottleDecision> {
  // The interval multiplier must be an integer; callers pass whole
  // milliseconds. Opportunistic sweep: expired windows never become readable
  // again, so delete them on write to keep the table bounded without a
  // sweeper job. Best-effort: a failed sweep must not block the decision.
  const window = Math.max(1, Math.floor(windowMs));
  try {
    await queryRows(`delete from throttle_buckets where reset_at <= now()`);
  } catch {
    // Fall through to the upsert below.
  }
  const rows = await queryRows<
    { count: string; retry_after_ms: number | string | bigint }
  >(THROTTLE_UPSERT_SQL, [bucket, key, window]);
  return throttleDecision(rows[0], limit, window);
}
