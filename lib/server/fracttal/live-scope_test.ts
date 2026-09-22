// Unit tests for the live scope fetch assembly (Phase 2 + all-station
// cycle). Pagination runs to the envelope total and any truncated ITEM page
// throws before runSync, so a partial page can never drive deletions (the
// outage drill is the truncation test below). Work pages stay bounded and
// truncation there is informational only: missing work misses signals but
// never deletes, so it must not abort the run.
import {
  fetchItemSignals,
  fetchScopeSignals,
  fetchWorkSignals,
} from "./live-scope.ts";

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
  orderPages?: unknown[][];
  requests?: unknown[];
  requestPages?: unknown[][];
  failWork?: boolean;
}

// stubClient serves scripted pages by start offset and records every call,
// so tests prove fetch order (guard before work fetch on truncation). Page
// arrays (orderPages/requestPages) model multi-page endpoints; the flat
// fields keep the old single-page shorthand.
function stubClient(pages: StubPages) {
  const calls: string[] = [];
  const flat = (rows?: unknown[][], single?: unknown[]): unknown[][] =>
    rows ?? (single ? [single] : [[]]);
  const orderPages = flat(pages.orderPages, pages.orders);
  const requestPages = flat(pages.requestPages, pages.requests);
  const totalOf = (all: unknown[][]): number =>
    all.reduce((n, p) => n + p.length, 0);
  return {
    calls,
    client: {
      listRawItems(query: FracttalListQuery) {
        calls.push(`items:${query.start ?? 0}`);
        const page = pages.items[Math.floor((query.start ?? 0) / 100)] ??
          { rows: [], total: 0 };
        return Promise.resolve(page);
      },
      listRawWorkOrders(query: FracttalWorkQuery) {
        calls.push(`orders:${query.start ?? 0}`);
        if (pages.failWork) return Promise.reject(new Error("wo down"));
        const page = orderPages[Math.floor((query.start ?? 0) / 100)] ?? [];
        return Promise.resolve({ rows: page, total: totalOf(orderPages) });
      },
      listRawWorkRequests(query: FracttalWorkQuery) {
        calls.push(`requests:${query.start ?? 0}`);
        const page = requestPages[Math.floor((query.start ?? 0) / 100)] ?? [];
        return Promise.resolve({ rows: page, total: totalOf(requestPages) });
      },
    },
  };
}

const opts = { itemType: 2 as const, maxPages: 40 };

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
  assertStrictEquals(fetched.ordersTruncated, false);
  assertStrictEquals(fetched.requestsTruncated, false);
  assertStrictEquals(
    calls.join(","),
    "items:0,items:100,items:200,orders:0,requests:0",
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

Deno.test("fetchWorkSignals merges several newest pages", async () => {
  const mkOrders = (n: number): unknown[][] => [
    Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-${i}`)),
    Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-${100 + i}`)),
    Array.from({ length: n }, (_, i) => plannedOrder(`EQ-${200 + i}`)),
  ];
  const { client, calls } = stubClient({ items: [], orderPages: mkOrders(50) });
  const work = await fetchWorkSignals(client, { maxPages: 5 });
  assertStrictEquals(work.workOrders, 250);
  assertStrictEquals(work.workRequests, 0);
  assertStrictEquals(work.workMalformed, 0);
  assertStrictEquals(work.ordersTruncated, false);
  assertStrictEquals(work.requestsTruncated, false);
  assertStrictEquals(
    work.workEvents("EQ-249")?.planned?.source,
    "OS - 1: fix",
  );
  assertStrictEquals(
    calls.join(","),
    "orders:0,requests:0,orders:100,orders:200",
  );
});

Deno.test("fetchWorkSignals caps at maxPages and flags truncation", async () => {
  const { client } = stubClient({
    items: [],
    orderPages: [
      Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-${i}`)),
      Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-${100 + i}`)),
    ],
  });
  // No throw: work truncation is informational (missing work misses signals
  // but never deletes), unlike item truncation.
  const work = await fetchWorkSignals(client, { maxPages: 1 });
  assertStrictEquals(work.workOrders, 100);
  assertStrictEquals(work.ordersTruncated, true);
  assertStrictEquals(work.requestsTruncated, false);
});

Deno.test("fetchWorkSignals sweeps each open ot_status separately", async () => {
  const seen: Array<{ start: number; otStatus?: string }> = [];
  const client = {
    listRawWorkOrders(query: FracttalWorkQuery) {
      seen.push({ start: query.start ?? 0, otStatus: query.otStatus });
      const rows = query.otStatus === "1"
        ? [plannedOrder("EQ-1")]
        : query.otStatus === "2"
        ? [plannedOrder("EQ-2")]
        : [];
      return Promise.resolve({ rows, total: rows.length });
    },
    listRawWorkRequests(_query: FracttalWorkQuery) {
      return Promise.resolve({ rows: [], total: 0 });
    },
  };
  const work = await fetchWorkSignals(client, {
    maxPages: 5,
    openStatuses: ["1", "2"],
  });
  assertStrictEquals(work.workOrders, 2);
  assertStrictEquals(work.ordersTruncated, false);
  assertStrictEquals(work.requestsTruncated, false);
  assertStrictEquals(work.workEvents("EQ-1")?.planned?.source, "OS - 1: fix");
  assertStrictEquals(work.workEvents("EQ-2")?.planned?.source, "OS - 1: fix");
  const statuses = seen.map((s) => `${s.otStatus}:${s.start}`).sort().join(
    ",",
  );
  assertStrictEquals(statuses, "1:0,2:0");
});

Deno.test("fetchWorkSignals caps each open sweep separately", async () => {
  const { client } = stubClient({
    items: [],
    orderPages: [
      Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-${i}`)),
      Array.from({ length: 100 }, (_, i) => plannedOrder(`EQ-x${i}`)),
    ],
  });
  const work = await fetchWorkSignals(client, {
    maxPages: 5,
    openStatuses: ["1"],
    openMaxPages: 1,
  });
  assertStrictEquals(work.workOrders, 100);
  assertStrictEquals(work.ordersTruncated, true);
});

Deno.test("fetchItemSignals reassembles concurrent pages in order", async () => {
  const client = {
    listRawItems(query: FracttalListQuery) {
      const start = query.start ?? 0;
      const rows = Array.from(
        { length: 100 },
        (_, i) => item(`EQ-${start}-${i}`),
      );
      // Middle page resolves last: merged order must still follow page index.
      const wait = start === 100 ? 20 : 0;
      return new Promise<{ rows: unknown[]; total: number }>((resolve) =>
        setTimeout(() => resolve({ rows, total: 300 }), wait)
      );
    },
  };
  const fetched = await fetchItemSignals(client, {
    itemType: 2,
    maxPages: 5,
    concurrency: 3,
  });
  const codes = fetched.itemRows.map((r) => (r as { code: string }).code);
  assertStrictEquals(codes.length, 300);
  assertStrictEquals(codes[0], "EQ-0-0");
  assertStrictEquals(codes[100], "EQ-100-0");
  assertStrictEquals(codes[200], "EQ-200-0");
  assertStrictEquals(codes[299], "EQ-200-99");
  assertStrictEquals(fetched.pagesFetched, 3);
});
