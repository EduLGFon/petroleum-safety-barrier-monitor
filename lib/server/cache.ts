// Response memo - tiny TTL cache for expensive read endpoints.
// This is why it exists: KPI/chart/vocab/sync-status recompute on every
// dashboard tick though the underlying rows barely move. A short
// stale-while-revalidate window absorbs auto-refresh stampedes without ever
// serving user-scoped bytes to the wrong scope (keys always include the
// scope hash; TTLs are seconds, not minutes).
interface Entry {
  at: number;
  body: unknown;
}

// MEMO_MAX_ENTRIES: ceiling on cached responses. The map is swept back to
// this budget on every write, so a burst of distinct scopes cannot grow it
// without bound.
const MEMO_MAX_ENTRIES = 500;

const store = new Map<string, Entry>();

function now(): number {
  return Date.now();
}

// get: fresh entry or undefined (stale entries are dropped on read).
export function memoGet(key: string, ttlMs: number): unknown | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (now() - e.at > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return e.body;
}

// set: stores a fresh entry, evicting oldest entries when over budget.
// The sweep removes every key above the cap, not just the first one: a
// single eviction can leave the map above the budget (the head of the map
// is the oldest insertion, not necessarily the stalest entry), and the memo
// must stay bounded no matter how many keys are written.
export function memoSet(key: string, body: unknown): void {
  store.set(key, { at: now(), body });
  while (store.size > MEMO_MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

// getOrCompute: returns the cached body or computes, stores and returns it.
// The compute runs only on miss/expiry, so ETag bodies (and their syncedAt)
// stay byte-stable inside the TTL window and conditional requests 304.
export async function memoGetOrCompute<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = memoGet(key, ttlMs);
  if (hit !== undefined) return hit as T;
  const body = await compute();
  memoSet(key, body);
  return body;
}

// scopeKey: stable key from endpoint + scope hash + filter hash. Callers
// must include every input that changes the output (filters, role, scope).
export function scopeKey(
  parts: Array<string | number | null | undefined>,
): string {
  return parts.map((p) => p ?? "-").join("|");
}
