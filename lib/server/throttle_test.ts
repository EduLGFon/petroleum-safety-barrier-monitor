// Unit tests for the fixed-window throttle (P4) - injected clock, no sleeps.
import { createThrottle, isIpLiteral, throttleKey } from "./throttle.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

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

Deno.test("isIpLiteral accepts real IPv4 and IPv6 addresses", () => {
  for (
    const ok of [
      "203.0.113.9",
      "10.0.0.7",
      "0.0.0.0",
      "255.255.255.255",
      "::1",
      "::",
      "2001:db8::1",
      "fe80::1",
      "::ffff:192.0.2.1",
      "0:0:0:0:0:ffff:1.2.3.4",
      " 203.0.113.9 ",
    ]
  ) {
    assertStrictEquals(isIpLiteral(ok), true, ok);
  }
});

Deno.test("isIpLiteral rejects anything that is not an address", () => {
  // A permissive shape check let partial addresses and punctuation through
  // as bucket keys, so a caller could pick a key that is not an address.
  for (
    const bad of [
      "",
      "   ",
      "1.2.3",
      "1.2.3.4.5",
      "999.1.1.1",
      "010.1.1.1",
      "1.2.3.-1",
      "::1::2",
      "1:2:3:4:5:6:7",
      "1:2:3:4:5:6:7:8:9",
      "fe80::1%eth0",
      "...",
      "::.",
      "localhost",
      "example.com",
      "deadbeef",
      "0x10",
      // An embedded IPv4 is only legal as the last group of the address.
      "::1.2.3.4:5",
      "1.2.3.4::",
      "1.2.3.4:5::6",
      "::ffff:1.2.3.4:5",
    ]
  ) {
    assertStrictEquals(isIpLiteral(bad), false, bad);
  }
});

Deno.test("throttle warns when evicting live buckets past the cap", () => {
  const t = createThrottle({ limit: 10, windowMs: 60_000, now: () => 0 });
  const originalWarn = console.warn;
  let warned = false;
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).includes("evicting live")) warned = true;
    originalWarn(...args);
  };
  try {
    for (let i = 0; i < 5001; i++) t.check(`k${i}`);
    if (!warned) throw new Error("expected console.warn on live eviction");
  } finally {
    console.warn = originalWarn;
  }
});
