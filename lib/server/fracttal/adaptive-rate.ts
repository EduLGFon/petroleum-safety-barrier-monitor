// Adaptive Fracttal rate controller - AIMD pacing under the 200 req/min/IP ceiling.
// This is why it exists: a static 150/min leaves 25% of the budget unused,
// while 199/min bursts across a window boundary and 406s on retries, token
// refreshes, or NAT-shared egress. This module owns the token bucket plus the
// adaptation policy (additive increase on clean traffic, multiplicative
// decrease only on real 406/429/5xx) so client.ts stays a pager. Low
// `ratelimit-remaining` never cuts the sustained rate: the remaining count
// naturally drains as we spend our own window, so the controller just stops
// spending past a safety margin and pauses when the window is exhausted.
export const DEFAULT_RATE_PER_MIN = 180;
export const DEFAULT_RATE_MAX_PER_MIN = 190;
export const DEFAULT_RATE_MIN_PER_MIN = 80;
export const DEFAULT_RATE_BURST = 10;
export const RATE_LOW_WATER = 15;
export const RATE_HOLD = 5;
export const RATE_INCREASE_EVERY = 25;

export interface AdaptiveRateOptions {
  initialRatePerMin?: number;
  maxRatePerMin?: number;
  minRatePerMin?: number;
  burst?: number;
  maxWaitMs?: number;
  now?: () => number;
  onRateChange?: (ratePerMin: number) => void;
}

export interface AdaptiveRate {
  currentRate(): number;
  takeToken(): Promise<void>;
  recordSuccess(remaining?: number | null, resetSecs?: number): void;
  recordLimited(): void;
  recordServerError(): void;
}

// parseRateLimitReset: seconds until the window resets. Docs contradict
// themselves across languages (Spanish ratelimit-* vs English
// Request-Call-Limit-*), so both spellings are accepted; unknown means 60s.
export function parseRateLimitReset(headers: Headers): number {
  const raw = headers.get("ratelimit-reset") ??
    headers.get("Request-Call-Limit-Reset");
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

// parseRateLimitRemaining: requests left in the window, or null when the
// server omits the header. Both doc spellings are accepted.
export function parseRateLimitRemaining(headers: Headers): number | null {
  const raw = headers.get("ratelimit-remaining") ??
    headers.get("Request-Call-Limit-Remaining");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// rateConfigFromEnv: reads the four rate envs with clamping so every script
// shares one parsing rule. initial defaults to 180, max to 190, min to 80.
export function rateConfigFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
): { initial: number; max: number; min: number; burst: number } {
  const num = (name: string, fallback: number) => {
    const v = Math.floor(Number(get(name)));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const max = num("FRACTTAL_RATE_MAX_PER_MIN", DEFAULT_RATE_MAX_PER_MIN);
  const min = num("FRACTTAL_RATE_MIN_PER_MIN", DEFAULT_RATE_MIN_PER_MIN);
  const initial = num("FRACTTAL_RATE_PER_MIN", DEFAULT_RATE_PER_MIN);
  const burst = num("FRACTTAL_RATE_BURST", DEFAULT_RATE_BURST);
  return {
    initial: Math.min(Math.max(1, initial), 200),
    max: Math.min(Math.max(1, max), 200),
    min: Math.max(1, Math.min(min, max)),
    burst: Math.max(1, Math.min(burst, 50)),
  };
}

// createAdaptiveRate: token bucket with a mutable refill rate. Sequential
// callers barely notice it; parallel page fetches share it, so concurrency
// can never exceed the ceiling. Retries consume tokens too (they are
// requests). Never exceed 200/min: the factory clamps max at 200.
export function createAdaptiveRate(
  opts: AdaptiveRateOptions = {},
): AdaptiveRate {
  const max = Math.min(Math.max(1, Math.floor(opts.maxRatePerMin ?? 190)), 200);
  const min = Math.max(1, Math.min(Math.floor(opts.minRatePerMin ?? 80), max));
  let rate = Math.min(
    max,
    Math.max(min, Math.floor(opts.initialRatePerMin ?? 180)),
  );
  const burst = Math.max(1, Math.min(Math.floor(opts.burst ?? 10), 50));
  const maxWaitMs = opts.maxWaitMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const onRateChange = opts.onRateChange;
  let tokens = burst;
  let refillAt = now();
  let holdUntil = 0;
  let successes = 0;

  const setRate = (next: number): void => {
    const clamped = Math.min(max, Math.max(min, Math.floor(next)));
    if (clamped !== rate) {
      rate = clamped;
      successes = 0;
      onRateChange?.(rate);
    }
  };

  const refill = (): void => {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - refillAt) / 60000) * rate);
    refillAt = t;
  };

  const takeToken = async (): Promise<void> => {
    for (;;) {
      refill();
      if (now() < holdUntil) {
        await new Promise<void>((r) =>
          setTimeout(r, Math.min(holdUntil - now(), maxWaitMs))
        );
        continue;
      }
      if (tokens >= 1) {
        tokens -= 1;
        return;
      }
      const waitMs = ((1 - tokens) / rate) * 60000;
      await new Promise<void>((r) =>
        setTimeout(r, Math.min(waitMs, maxWaitMs))
      );
    }
  };

  // recordSuccess: additive increase with a gap-proportional step (fast
  // recovery far below max, fine tuning near it). Low remaining never cuts
  // the sustained rate: the count drains as we spend our own window, so the
  // controller clamps local spending to what the server has left (minus a
  // safety margin) and pauses out the window when exhausted. Only real
  // 406/429/5xx cut the rate.
  const recordSuccess = (
    remaining?: number | null,
    resetSecs = 60,
  ): void => {
    if (remaining !== null && remaining !== undefined) {
      if (remaining <= RATE_HOLD) {
        const resetMs = Math.max(0, resetSecs) * 1000;
        holdUntil = Math.max(holdUntil, now() + resetMs);
        tokens = Math.min(tokens, 0);
        successes = 0;
        return;
      }
      if (remaining <= RATE_LOW_WATER) {
        tokens = Math.min(tokens, Math.max(0, remaining - RATE_HOLD));
        successes = 0;
        return;
      }
    }
    successes++;
    if (successes >= RATE_INCREASE_EVERY) {
      successes = 0;
      setRate(rate + Math.max(1, Math.floor((max - rate) / 10)));
    }
  };

  // recordLimited: called on 406/429. Multiplicative decrease drains the
  // burst so the retry cannot re-fire immediately.
  const recordLimited = (): void => {
    tokens = Math.min(tokens, 0);
    setRate(rate * 0.7);
  };

  // recordServerError: 5xx and timeouts signal upstream stress; ease off
  // gently instead of holding a rate the server cannot serve.
  const recordServerError = (): void => {
    setRate(rate * 0.9);
  };

  return {
    currentRate: () => rate,
    takeToken,
    recordSuccess,
    recordLimited,
    recordServerError,
  };
}
