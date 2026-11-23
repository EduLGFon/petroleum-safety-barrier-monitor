// Best-effort signal registration for long-running scripts.
// This is why it exists: Windows services (NSSM) never deliver POSIX
// signals, and `Deno.addSignalListener("SIGTERM")` throws at startup there,
// which crashed the poller/alerts loop before their first cycle (audit
// F10). Registration selects the signals each platform can actually
// deliver and swallows per-signal errors with a visible line: a missing
// signal degrades graceful shutdown only, it must never block the loop
// from starting.
export type SignalName = "SIGINT" | "SIGBREAK" | "SIGTERM";

// signalsForPlatform: which stop signals a platform can deliver. Windows
// services deliver only the console signals (SIGINT/SIGBREAK); POSIX
// platforms get SIGINT plus the service-manager SIGTERM. Pure so the
// selection stays unit-testable without touching real listeners.
export function signalsForPlatform(os: string): SignalName[] {
  if (os === "windows") return ["SIGINT", "SIGBREAK"];
  return ["SIGINT", "SIGTERM"];
}

// addSignalListenerBestEffort: registers every signal the platform
// supports against one handler. opts are injectable so tests can pin the
// platform, stub the registration and capture warnings; production callers
// pass only the handler.
export function addSignalListenerBestEffort(
  handler: () => void,
  opts: {
    os?: string;
    register?: (signal: SignalName, onSignal: () => void) => void;
    warn?: (line: string) => void;
  } = {},
): void {
  const os = opts.os ?? Deno.build.os;
  const register = opts.register ??
    ((signal, onSignal) => Deno.addSignalListener(signal, onSignal));
  const warn = opts.warn ?? ((line: string) => console.warn(line));
  for (const signal of signalsForPlatform(os)) {
    try {
      register(signal, handler);
    } catch (err) {
      // SECURITY/robustness: an unsupported signal must never crash the
      // service at startup; the loop keeps running without graceful stop.
      warn(
        `[signals] ${signal} listener unavailable on this platform; ` +
          `continuing without it (${
            err instanceof Error ? err.message : String(err)
          })`,
      );
    }
  }
}
