// Tests bounded raw Fracttal detail retrieval and exact-code filtering.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { fetchRawBarrierDetail } from "./raw-detail.ts";

import type { FracttalClient } from "./client.ts";

function clientOf(
  overrides: Partial<
    Pick<
      FracttalClient,
      "fetchRawItem" | "listRawWorkOrders" | "listRawWorkRequests"
    >
  > = {},
): Pick<
  FracttalClient,
  "fetchRawItem" | "listRawWorkOrders" | "listRawWorkRequests"
> {
  return {
    fetchRawItem: (code) =>
      Promise.resolve({
        row: { code, custom_field: "kept" },
      }),
    listRawWorkOrders: () => Promise.resolve({ rows: [], total: 0 }),
    listRawWorkRequests: () => Promise.resolve({ rows: [], total: 0 }),
    ...overrides,
  };
}

Deno.test("fetchRawBarrierDetail returns raw fields and exact-code rows", async () => {
  let orderQuery: { codeAsset?: string; start?: number; limit?: number } = {};
  let requestQuery: { codeItem?: string; start?: number; limit?: number } = {};
  const rawOrder = { code: "EQ-1", task_note: "raw note", extra: 42 };
  const rawRequest = { code_item: "EQ-1", description: "raw request" };
  const detail = await fetchRawBarrierDetail(
    clientOf({
      listRawWorkOrders: (query) => {
        orderQuery = query;
        return Promise.resolve({
          rows: [rawOrder, { code: "OTHER", private_text: "excluded" }],
          total: 2,
        });
      },
      listRawWorkRequests: (query) => {
        requestQuery = query;
        return Promise.resolve({
          rows: [rawRequest, { code_item: "OTHER", private_text: "excluded" }],
          total: 2,
        });
      },
    }),
    "EQ-1",
  );
  assertEquals(detail.asset, { code: "EQ-1", custom_field: "kept" });
  assertEquals(detail.workOrders.rows, [rawOrder]);
  assertEquals(detail.workRequests.rows, [rawRequest]);
  assertStrictEquals(detail.workOrders.excludedRows, 1);
  assertStrictEquals(detail.workRequests.excludedRows, 1);
  assertStrictEquals(orderQuery.codeAsset, "EQ-1");
  assertStrictEquals(requestQuery.codeItem, "EQ-1");
  assertStrictEquals(orderQuery.limit, 100);
  assertStrictEquals(requestQuery.limit, 100);
});

Deno.test("fetchRawBarrierDetail caps each related endpoint at 500 rows", async () => {
  const orderStarts: number[] = [];
  const requestStarts: number[] = [];
  const rowsFor = (start: number, key: string) =>
    Array.from({ length: 100 }, (_, index) => ({
      [key]: "EQ-1",
      row: start + index,
    }));
  const detail = await fetchRawBarrierDetail(
    clientOf({
      listRawWorkOrders: ({ start = 0 }) => {
        orderStarts.push(start);
        return Promise.resolve({
          rows: rowsFor(start, "code_asset"),
          total: 650,
        });
      },
      listRawWorkRequests: ({ start = 0 }) => {
        requestStarts.push(start);
        return Promise.resolve({
          rows: rowsFor(start, "code_item"),
          total: 650,
        });
      },
    }),
    "EQ-1",
  );
  assertStrictEquals(detail.workOrders.rows.length, 500);
  assertStrictEquals(detail.workRequests.rows.length, 500);
  assertStrictEquals(detail.workOrders.upstreamTotal, 650);
  assertStrictEquals(detail.workRequests.upstreamTotal, 650);
  assertStrictEquals(detail.workOrders.truncated, true);
  assertStrictEquals(detail.workRequests.truncated, true);
  assertEquals(orderStarts.sort((a, b) => a - b), [0, 100, 200, 300, 400]);
  assertEquals(requestStarts.sort((a, b) => a - b), [0, 100, 200, 300, 400]);
});
