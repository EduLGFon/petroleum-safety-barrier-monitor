// Hook test for hooks/dashboard/sync-status.ts - an empty baseUrl means
// same-origin (relative /api/*), so the indicator must still poll instead of
// treating the dashboard as unconfigured.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { renderHook, waitFor } from "../../scripts/test-dom.ts";

import type { SyncStatus } from "../../lib/types.ts";

import { useSyncStatus } from "./sync-status.ts";

const STATUS: SyncStatus = {
  state: "idle",
  runningSince: null,
  lastRun: null,
  totals: { barriers: 7 },
};

Deno.test("useSyncStatus polls relative paths when baseUrl is same-origin", async () => {
  const prev = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: unknown) => {
    urls.push(String(input));
    return Promise.resolve(
      new Response(JSON.stringify(STATUS), {
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    const hh = await renderHook(useSyncStatus, {
      args: ["", 60_000, 15_000, true],
    });
    await waitFor(() => hh.get() !== null);
    assertStrictEquals(hh.get()?.totals.barriers, 7);
    assertStrictEquals(urls[0], "/api/sync-status");
  } finally {
    globalThis.fetch = prev;
  }
});
