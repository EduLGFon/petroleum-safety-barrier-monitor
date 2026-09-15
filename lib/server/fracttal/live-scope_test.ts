// Unit tests for the live scope fetch assembly (Phase 2). Pagination runs
// to the envelope total and any truncation throws before runSync, so a
// partial page can never drive deletions (the outage drill is the
// truncation test below).
import { fetchScopeSignals } from "./live-scope.ts";

import type { FracttalListQuery, FracttalWorkQuery } from "./types.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

function item(code: string): Record<string, unknown> {
  return { id: 1, code };
}

function plannedOrder(code: string): Record<string, unknown> {
  return {
    code,
    done: false,
    tasks_log_types_description: "CORR - Corretiva Planejada",
    types_description: null,
    stop_assets: false,
    wo_folio: "OS - 1",
    description: "fix",
    initial_date: null,
    date_maintenance: "2026-09-10",
    creation_date: null,
  };
}

interface StubPages {
  items: Array<{ rows: unknown[]; total: number }>;
  orders?: unknown[];
  requests?: unknown[];
  failWork?: boolean;
}

// stubClient serves scripted pages by start offset and records every call,
// so tests prove fetch order (guard before work fetch on truncation).
function stubClient(pages: StubPages) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      listRawItems(query: FracttalListQuery) {
        calls.push(`items:${query.start ?? 0}`);
        const page = pages.items[Math.floor((query.start ?? 0) / 100)] ??
          { rows: [], total: 0 };
        return Promise.resolve(page);
      },
      listRawWorkOrders(_query: FracttalWorkQuery) {
        calls.push("orders");
        if (pages.failWork) return Promise.reject(new Error("wo down"));
        const rows = pages.orders ?? [];
        return Promise.resolve({ rows, total: rows.length });
      },
      listRawWorkRequests(_query: FracttalWorkQuery) {
        calls.push("requests");
        const rows = pages.requests ?? [];
        return Promise.resolve({ rows, total: rows.length });
      },
    },
  };
}

const opts = { locationCode: "FAL", itemType: 2 as const, maxPages: 40 };

Deno.test("fetchScopeSignals paginates items and merges work", async () => {
  const rows = Array.from({ length: 250 }, (_, i) => item(`EQ-${i}`));
  const { client, calls } = stubClient({
    items: [
      { rows: rows.slice(0, 100), total: 250 },
      { rows: rows.slice(100, 200), total: 250 },
      { rows: rows.slice(200), total: 250 },
    ],
    orders: [plannedOrder("EQ-1")],
  });
  const fetched = await fetchScopeSignals(client, opts);
  assertStrictEquals(fetched.itemRows.length, 250);
  assertStrictEquals(fetched.pagesFetched, 3);
  assertStrictEquals(fetched.workOrders, 1);
  assertStrictEquals(
    fetched.workEvents("EQ-1")?.planned?.source,
    "OS - 1: fix",
  );
  assertStrictEquals(fetched.workEvents("EQ-9"), null);
  assertStrictEquals(
    calls.join(","),
    "items:0,items:100,items:200,orders,requests",
  );
});

Deno.test("fetchScopeSignals throws before work fetch on truncation", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => item(`EQ-${i}`));
  const { client, calls } = stubClient({
    items: [{ rows, total: 250 }],
  });
  let caught: Error | null = null;
  try {
    await fetchScopeSignals(client, { ...opts, maxPages: 1 });
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught !== null, true);
  assertStrictEquals(caught!.message.includes("truncated page"), true);
  // Guard fires before any work fetch: the outage drill retires zero rows
  // because runSync is never reached.
  assertStrictEquals(calls.join(","), "items:0");
});

Deno.test("fetchScopeSignals propagates work failures fail-closed", async () => {
  const { client } = stubClient({
    items: [{ rows: [item("EQ-1")], total: 1 }],
    failWork: true,
  });
  let caught: Error | null = null;
  try {
    await fetchScopeSignals(client, opts);
  } catch (err) {
    caught = err as Error;
  }
  assertStrictEquals(caught?.message, "wo down");
});

Deno.test("fetchScopeSignals handles empty scopes", async () => {
  const { client } = stubClient({ items: [{ rows: [], total: 0 }] });
  const fetched = await fetchScopeSignals(client, opts);
  assertStrictEquals(fetched.itemRows.length, 0);
  assertStrictEquals(fetched.pagesFetched, 1);
});
