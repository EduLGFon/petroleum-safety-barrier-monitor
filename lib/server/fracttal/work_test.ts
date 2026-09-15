// Unit tests for live work-order signals (Phase 1). Row semantics mirror
// the dump import exactly (same classifiers, same open/closed gates), so a
// live run and a rebuild agree on every status.
import {
  buildWorkEvents,
  parseWorkOrder,
  parseWorkRequest,
  resolverFor,
  workOrderSlot,
  workRequestSlot,
} from "./work.ts";

import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "jsr:@std/assert@^1";

function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: "FAL-EQ-001",
    done: false,
    tasks_log_types_description: "CORR - Corretiva Planejada",
    types_description: null,
    stop_assets: false,
    wo_folio: "OS - 9001",
    description: "Sanar falha",
    initial_date: null,
    date_maintenance: "2026-09-10",
    creation_date: "2026-09-09",
    ...over,
  };
}

function request(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code_item: "FAL-EQ-001",
    id_status: 1,
    types_2_description: "CORR - Planejada",
    wo_folio: null,
    description: "Solicitacao",
    date_maintenance: "2026-09-08",
    ...over,
  };
}

Deno.test("parseWorkOrder requires the join code", () => {
  assertStrictEquals(parseWorkOrder(order()).code, "FAL-EQ-001");
  assertThrows(() => parseWorkOrder({ ...order(), code: "" }), Error);
  assertThrows(() => parseWorkOrder(null), Error);
});

Deno.test("parseWorkRequest requires code_item", () => {
  assertStrictEquals(parseWorkRequest(request()).code_item, "FAL-EQ-001");
  assertThrows(() => parseWorkRequest({}), Error);
});

Deno.test("workOrderSlot gates on done and classifies", () => {
  const planned = workOrderSlot(parseWorkOrder(order()));
  assertStrictEquals(planned?.planned?.source, "OS - 9001: Sanar falha");
  assertStrictEquals(planned?.planned?.date, "2026-09-09");
  assertStrictEquals(planned?.urgent, null);
  assertStrictEquals(
    workOrderSlot(parseWorkOrder(order({ done: true }))),
    null,
  );
  assertStrictEquals(
    workOrderSlot(
      parseWorkOrder(order({ tasks_log_types_description: "PREV" })),
    )?.planned,
    null,
  );
  const stop = workOrderSlot(
    parseWorkOrder(
      order({ tasks_log_types_description: "PREV", stop_assets: true }),
    ),
  );
  assertStrictEquals(stop?.stopAssets, true);
  assertStrictEquals(stop?.planned, null);
});

Deno.test("workRequestSlot gates on closed status and type", () => {
  // Abbreviated live labels carry no corrective stem (pinned import parity).
  assertStrictEquals(workRequestSlot(parseWorkRequest(request())), null);
  const full = workRequestSlot(
    parseWorkRequest(request({ types_2_description: "Corretiva Emergencial" })),
  );
  assertStrictEquals(full?.urgent?.date, "2026-09-08");
  assertStrictEquals(
    workRequestSlot(parseWorkRequest(request({ id_status: 4 }))),
    null,
  );
});

Deno.test("buildWorkEvents merges per code keeping the first event", () => {
  const { events, malformed } = buildWorkEvents(
    [
      order(),
      order({ wo_folio: "OS - 9002", date_maintenance: "2026-09-12" }),
      { code: "" },
    ],
    [request({ types_2_description: "Corretiva Planejada" })],
  );
  assertStrictEquals(malformed.length, 1);
  const acc = events.get("FAL-EQ-001");
  assertStrictEquals(acc?.planned?.date, "2026-09-09");
  assertStrictEquals(acc?.planned?.source, "OS - 9001: Sanar falha");
  assertStrictEquals(acc?.stopAssets, false);
  assertStrictEquals(resolverFor(events)("ZZZ"), null);
  assertEquals(
    resolverFor(events)("FAL-EQ-001")?.planned?.date,
    "2026-09-09",
  );
});
