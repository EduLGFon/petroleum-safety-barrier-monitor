// Unit tests for useContingencyState search and data retention.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { renderHook, waitFor } from "../../scripts/test-dom.ts";
import { useContingencyState } from "./BarrierContingency.tsx";
import type { BarrierContingencies } from "../../lib/api.ts";
import { act } from "preact/test-utils";

const mockContingencies: BarrierContingencies = {
  outgoing: [],
  incoming: [],
  candidates: [
    { id: 10, tag: "TAG-ALPHA" },
    { id: 11, tag: "TAG-BETA" },
  ],
  candidatesHaveMore: false,
};

Deno.test("useContingencyState preserves data and does not clear on query change", async () => {
  const originalFetch = globalThis.fetch;
  let lastQueryParam: string | null = null;
  globalThis.fetch = (input: string | URL | Request) => {
    const url = new URL(String(input));
    lastQueryParam = url.searchParams.get("q");
    const candidates = lastQueryParam === "BETA"
      ? [{ id: 11, tag: "TAG-BETA" }]
      : mockContingencies.candidates;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          outgoing: [],
          incoming: [],
          candidates,
          candidatesHaveMore: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  };

  function useHook(args: { barrierId: number; connected: boolean }) {
    return useContingencyState(
      args.barrierId,
      args.connected,
      "http://localhost",
    );
  }

  try {
    const hook = await renderHook(useHook, {
      args: [{ barrierId: 1, connected: true }],
    });

    // Wait for initial load to finish
    await waitFor(() => hook.get().data !== null);
    assertEquals(hook.get().data?.candidates.length, 2);
    assertStrictEquals(lastQueryParam, null);

    // Type a query: setQuery should update query and NOT reset data to null
    await act(() => {
      hook.get().setQuery("BETA");
    });

    assertStrictEquals(hook.get().query, "BETA");
    // Crucial check: data MUST NOT be null when query changes, so that UI elements
    // (such as the search input) are not unmounted from the DOM.
    assertStrictEquals(
      hook.get().data !== null,
      true,
      "Data must be retained while debouncing/fetching to prevent input unmount",
    );
    assertEquals(hook.get().data?.candidates.length, 2);

    // Wait for debounce (250ms) and fetch to complete
    await waitFor(() => lastQueryParam === "BETA");
    await waitFor(() => hook.get().data?.candidates.length === 1);
    assertEquals(hook.get().data?.candidates[0].tag, "TAG-BETA");

    // When barrierId changes, state should be reset for the new barrier
    await hook.rerender({ barrierId: 2, connected: true });
    // Data resets for a different barrier
    assertStrictEquals(hook.get().query, "");
    // Wait for new barrier fetch
    await waitFor(() => hook.get().data !== null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
