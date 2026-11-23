// Unit tests for best-effort signal registration (audit F10). The platform
// selection is pure; registration is exercised with a stub so unsupported
// signals degrade to a warning instead of crashing startup, and once with
// the real Deno listener (registered then released) to prove the wiring.
import { addSignalListenerBestEffort, signalsForPlatform } from "./signals.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("signalsForPlatform selects the deliverable stop signals", () => {
  // Windows services (NSSM) deliver only console signals: SIGTERM would
  // throw on registration and crashed the service at startup (audit F10).
  assertStrictEquals(
    signalsForPlatform("windows").join(","),
    "SIGINT,SIGBREAK",
  );
  assertStrictEquals(signalsForPlatform("linux").join(","), "SIGINT,SIGTERM");
  assertStrictEquals(signalsForPlatform("darwin").join(","), "SIGINT,SIGTERM");
});

Deno.test("addSignalListenerBestEffort swallows unsupported signals", () => {
  const registered: string[] = [];
  const warned: string[] = [];
  addSignalListenerBestEffort(() => {}, {
    os: "windows",
    register: (signal) => {
      // First signal lands, second throws: a broken listener must degrade,
      // never crash startup (audit F10).
      if (registered.length > 0) {
        throw new Error("SIGBREAK not supported");
      }
      registered.push(signal);
    },
    warn: (line) => warned.push(line),
  });
  assertStrictEquals(registered.join(","), "SIGINT");
  assertStrictEquals(warned.length, 1);
  assertStrictEquals(warned[0]!.includes("SIGBREAK"), true);
});

Deno.test("addSignalListenerBestEffort registers on this platform", () => {
  let called = 0;
  const handler = () => {
    called++;
  };
  // Real registration path (no stubs); the listener is released right away
  // so the test process never acts on a signal.
  addSignalListenerBestEffort(handler);
  for (const signal of signalsForPlatform(Deno.build.os)) {
    Deno.removeSignalListener(signal, handler);
  }
  assertStrictEquals(called, 0);
});
