// Unit tests for the fixed-window throttle (P4) - injected clock, no sleeps.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { createThrottle, throttleKey } from "./throttle.ts";

Deno.test("throttle allows up to the limit then denies with retry-after", () => {
  const at = 0;
  const t = createThrottle({ limit: 2, windowMs: 60_000, now: () => at });
  assertStrictEquals(t.check("ip").allowed, true);
  assertStrictEquals(t.check("ip").allowed, true);
  const denied = t.check("ip");
  assertStrictEquals(denied.allowed, false);
  assertStrictEquals(denied.retryAfterMs, 60_000);
});

Deno.test("throttle buckets keys independently", () => {
  const t = createThrottle({ limit: 1, windowMs: 60_000, now: () => 0 });
  assertStrictEquals(t.check("a").allowed, true);
  assertStrictEquals(t.check("a").allowed, false);
  assertStrictEquals(t.check("b").allowed, true);
});

Deno.test("throttle resets when the window elapses", () => {
  let at = 0;
  const t = createThrottle({ limit: 1, windowMs: 1_000, now: () => at });
  assertStrictEquals(t.check("ip").allowed, true);
  assertStrictEquals(t.check("ip").allowed, false);
  at = 1_001;
  assertStrictEquals(t.check("ip").allowed, true);
});

Deno.test("throttleKey reads the remote hostname, never proxy headers", () => {
  assertStrictEquals(throttleKey({ hostname: "10.0.0.7" }), "10.0.0.7");
  assertStrictEquals(throttleKey(undefined), "unknown");
  assertStrictEquals(throttleKey({}), "unknown");
});
