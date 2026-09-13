// Hook tests for hooks/dashboard/server.ts- HTTP-mode gating (loading/error/retry)
// and scope-driven refetch, with a fake BarriersApi injected via the adapter param.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { renderHook, waitFor } from "../../scripts/test-dom.ts";
import { mockAdapter } from "../../lib/api/mock.ts";
import type { BarriersApi } from "../../lib/api/types.ts";
import type { BarriersQuery } from "../../lib/wireTypes.ts";
import { useServerDashboard } from "./server.ts";

type D = ReturnType<typeof useServerDashboard>;

const BASE = "http://x.test";

Deno.test("useServerDashboard loads page/kpi/chart after hydration", async () => {
  const calls: string[] = [];
  const spy: BarriersApi = {
    ...mockAdapter,
    getBarriers(q) {
      calls.push(`barriers:${q.locationId ?? 0}`);
      return mockAdapter.getBarriers(q);
    },
    getKpi(q) {
      calls.push(`kpi:${q.locationId ?? 0}`);
      return mockAdapter.getKpi(q);
    },
    getChartData(q) {
      calls.push(`chart:${q.locationId ?? 0}`);
      return mockAdapter.getChartData(q);
    },
  };
  const hh = await renderHook(useServerDashboard, { args: [BASE, "ALL", spy] });
  await waitFor(() => hh.get().rows.length > 0);
  const d = hh.get();
  assertStrictEquals(d.loading, false);
  assertStrictEquals(d.error, null);
  assertStrictEquals(d.rows.length, 25); // one page
  assertStrictEquals(d.filteredTotal, 6800);
  assertStrictEquals(d.kpi.total, d.filteredTotal);
  assertEquals(calls, ["barriers:0", "kpi:0", "chart:0"]);
});

Deno.test("useServerDashboard encodes the wire query for the current scope", async () => {
  let lastQuery: BarriersQuery | undefined;
  const spy: BarriersApi = {
    ...mockAdapter,
    getBarriers(q) {
      lastQuery = q;
      return mockAdapter.getBarriers(q);
    },
  };
  const hh = await renderHook(useServerDashboard, { args: [BASE, "ALL", spy] });
  hh.get().setFilter({ query: "pump", disponibilidade: "Degradado" });
  await waitFor(() => lastQuery?.query === "pump");
  assertStrictEquals(lastQuery?.query, "pump");
  assertStrictEquals(lastQuery?.disponibilidadeId, 4);
});

Deno.test("useServerDashboard refetches on scope change", async () => {
  let barrierCalls = 0;
  const spy: BarriersApi = {
    ...mockAdapter,
    getBarriers(q) {
      barrierCalls++;
      return mockAdapter.getBarriers(q);
    },
  };
  const hh = await renderHook(useServerDashboard, { args: [BASE, "ALL", spy] });
  await waitFor(() => hh.get().rows.length > 0);
  assertStrictEquals(barrierCalls, 1);
  hh.get().setLocation("FAL");
  await waitFor(() => hh.get().location === "FAL");
  await waitFor(() => barrierCalls === 2);
  assertStrictEquals(hh.get().kpi.total > 0, true);
});

Deno.test("useServerDashboard surfaces a fetch failure and clears loading", async () => {
  const fail: BarriersApi = {
    getBarriers: () => Promise.reject(new Error("boom")),
    getAllBarriers: () => Promise.reject(new Error("boom")),
    getBarrierById: () => Promise.reject(new Error("boom")),
    getKpi: () => Promise.reject(new Error("boom")),
    getChartData: () => Promise.reject(new Error("boom")),
  };
  const hh = await renderHook(useServerDashboard, {
    args: [BASE, "ALL", fail],
  });
  await waitFor(() => hh.get().error !== null);
  const d = hh.get();
  assertStrictEquals(d.loading, false);
  assertStrictEquals(d.error, "boom");
  assertStrictEquals(d.rows.length, 0);
});

Deno.test("useServerDashboard retry recovers after a failure", async () => {
  let attempts = 0;
  const flaky: BarriersApi = {
    getBarriers: (q) => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new Error("boom"))
        : mockAdapter.getBarriers(q);
    },
    getAllBarriers: (q) => mockAdapter.getAllBarriers(q),
    getBarrierById: (id) => mockAdapter.getBarrierById(id),
    getKpi: (q) => mockAdapter.getKpi(q),
    getChartData: (q) => mockAdapter.getChartData(q),
  };
  const hh = await renderHook(useServerDashboard, {
    args: [BASE, "ALL", flaky],
  });
  await waitFor(() => hh.get().error !== null);
  assertStrictEquals(hh.get().rows.length, 0);
  hh.get().retry();
  await waitFor(() => hh.get().rows.length > 0);
  assertStrictEquals(hh.get().error, null);
  assertStrictEquals(hh.get().loading, false);
});
