// Unit tests for the adaptive Fracttal rate controller - AIMD pacing,
// header parsing, and env config. All local, no network.
import {
  createAdaptiveRate,
  DEFAULT_RATE_BURST,
  DEFAULT_RATE_MAX_PER_MIN,
  DEFAULT_RATE_MIN_PER_MIN,
  DEFAULT_RATE_PER_MIN,
  parseRateLimitRemaining,
  parseRateLimitReset,
  RATE_LOW_WATER,
  rateConfigFromEnv,
} from "./adaptive-rate.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("rate defaults cruise near the ceiling with a small burst", () => {
  assertStrictEquals(DEFAULT_RATE_PER_MIN, 180);
  assertStrictEquals(DEFAULT_RATE_MAX_PER_MIN, 190);
  assertStrictEquals(DEFAULT_RATE_MIN_PER_MIN, 80);
  assertStrictEquals(DEFAULT_RATE_BURST, 10);
});

Deno.test("parseRateLimitReset accepts both header spellings", () => {
  assertStrictEquals(
    parseRateLimitReset(new Headers({ "ratelimit-reset": "7" })),
    7,
  );
  assertStrictEquals(
    parseRateLimitReset(new Headers({ "Request-Call-Limit-Reset": "9" })),
    9,
  );
  assertStrictEquals(parseRateLimitReset(new Headers()), 60);
});

Deno.test("parseRateLimitRemaining accepts both spellings or null", () => {
  assertStrictEquals(
    parseRateLimitRemaining(new Headers({ "ratelimit-remaining": "3" })),
    3,
  );
  assertStrictEquals(
    parseRateLimitRemaining(
      new Headers({ "Request-Call-Limit-Remaining": "12" }),
    ),
    12,
  );
  assertStrictEquals(parseRateLimitRemaining(new Headers()), null);
});

Deno.test("recordLimited cuts the rate multiplicatively", () => {
  const seen: number[] = [];
  const limiter = createAdaptiveRate({
    initialRatePerMin: 180,
    onRateChange: (r) => seen.push(r),
  });
  limiter.recordLimited();
  assertStrictEquals(limiter.currentRate(), Math.floor(180 * 0.7));
  assertStrictEquals(seen.length, 1);
});

Deno.test("low remaining backs off before a 406 happens", () => {
  const limiter = createAdaptiveRate({ initialRatePerMin: 180 });
  limiter.recordSuccess(RATE_LOW_WATER);
  assertStrictEquals(limiter.currentRate() < 180, true);
});

Deno.test("clean traffic inches the rate up to the cap", () => {
  const limiter = createAdaptiveRate({
    initialRatePerMin: 180,
    maxRatePerMin: 182,
  });
  for (let i = 0; i < 250; i++) limiter.recordSuccess(null);
  assertStrictEquals(limiter.currentRate(), 182);
});

Deno.test("rate never exceeds 200 even when misconfigured", () => {
  const limiter = createAdaptiveRate({
    initialRatePerMin: 500,
    maxRatePerMin: 500,
  });
  assertStrictEquals(limiter.currentRate() <= 200, true);
});

Deno.test("takeToken spends the burst then paces", async () => {
  let t = 0;
  const limiter = createAdaptiveRate({
    initialRatePerMin: 190,
    maxRatePerMin: 190,
    minRatePerMin: 190,
    burst: 2,
    maxWaitMs: 5,
    now: () => t,
  });
  await limiter.takeToken();
  await limiter.takeToken();
  t += 5_000;
  await limiter.takeToken();
  assertStrictEquals(limiter.currentRate(), 190);
});

Deno.test("rateConfigFromEnv clamps the ceiling at 200", () => {
  const cfg = rateConfigFromEnv((n) =>
    n === "FRACTTAL_RATE_MAX_PER_MIN" ? "999" : undefined
  );
  assertEquals(cfg.max, 200);
  assertEquals(cfg.initial, 180);
});
