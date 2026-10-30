// Unit tests for live work-order signals (Phase 1). Row semantics mirror
// the dump import exactly (same classifiers, same open/closed gates), so a
// live run and a rebuild agree on every status.
import {
  buildWorkEvents,
  contingencyFromRaw,
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
  assertStrictEquals(full?.urgent?.isUrgent, false);
  const urgentPlanned = workRequestSlot(
    parseWorkRequest(
      request({
        types_2_description: "Corretiva Planejada",
        is_urgent: true,
      }),
    ),
  );
  assertStrictEquals(urgentPlanned?.planned?.isUrgent, true);
  const nonUrgentPlanned = workRequestSlot(
    parseWorkRequest(
      request({ types_2_description: "Corretiva Planejada" }),
    ),
  );
  assertStrictEquals(nonUrgentPlanned?.planned?.isUrgent, false);
  assertStrictEquals(
    workRequestSlot(parseWorkRequest(request({ id_status: 4 }))),
    null,
  );
});

Deno.test("workOrderSlot never marks planned as urgent", () => {
  const planned = workOrderSlot(parseWorkOrder(order()));
  assertStrictEquals(planned?.planned?.isUrgent, false);
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

Deno.test("work event carries the Fracttal author and involved people", () => {
  const { events } = buildWorkEvents(
    [
      order({
        created_by: "Pessoa criadora",
        requested_by: "Pessoa solicitante",
        personnel_description: "Pessoa atribuída",
        user_assigned: "Pessoa atribuída",
        resources_human_resources: "Pessoa técnica A; Pessoa técnica B",
        validated_by_description: "Pessoa validadora",
      }),
    ],
    [],
  );
  const event = events.get("FAL-EQ-001")?.planned;
  assertStrictEquals(event?.sourceAuthor, "Pessoa criadora");
  assertStrictEquals(event?.sourceType, "Ordem de serviço");
  assertStrictEquals(event?.operationState, "Em aberto");
  assertEquals(event?.participants, [
    { name: "Pessoa criadora", role: "Criado por" },
    { name: "Pessoa solicitante", role: "Solicitado por" },
    { name: "Pessoa atribuída", role: "Pessoal, Usuário atribuído" },
    { name: "Pessoa técnica A", role: "Recursos humanos" },
    { name: "Pessoa técnica B", role: "Recursos humanos" },
    { name: "Pessoa validadora", role: "Validado por" },
  ]);
});

Deno.test("buildWorkEvents recovers empty-code orders via itemIdToCode", () => {
  const itemIdToCode = (id: number) => id === 15413228 ? "FAL-EQ-001" : null;
  const built = buildWorkEvents(
    [
      { ...order(), code: "", id_item: 15413228 },
      { ...order(), code: "", id_item: 999 },
      { ...order(), code: "" },
    ],
    [],
    { itemIdToCode },
  );
  assertStrictEquals(built.malformed.length, 2);
  assertStrictEquals(built.recovered, 1);
  assertStrictEquals(
    built.events.get("FAL-EQ-001")?.planned?.source,
    "OS - 9001: Sanar falha",
  );
});

Deno.test("buildWorkEvents counts no recovery without the id map", () => {
  const built = buildWorkEvents([{ ...order(), code: "", id_item: 1 }], []);
  assertStrictEquals(built.malformed.length, 1);
  assertStrictEquals(built.recovered, 0);
});

Deno.test("workOrderSlot flags contingency text without changing the slot", () => {
  const cont = workOrderSlot(
    parseWorkOrder(order({ description: "Falha com contingência GM-123" })),
  );
  assertStrictEquals(cont?.hasContingency, true);
  assertStrictEquals(cont?.planned !== null, true);
  const plain = workOrderSlot(parseWorkOrder(order()));
  assertStrictEquals(plain?.hasContingency, false);
});

Deno.test("contingencyFromRaw scans labels and custom status", () => {
  assertStrictEquals(contingencyFromRaw({ labels: ["CEC"] }), true);
  assertStrictEquals(
    contingencyFromRaw({ work_orders_status_custom_description: "GM ok" }),
    true,
  );
  assertStrictEquals(contingencyFromRaw({ description: "rotina" }), false);
});

Deno.test("buildWorkEvents merges contingency per code with source", () => {
  const { events } = buildWorkEvents(
    [order({ description: "Corretiva com contingência aplicada" })],
    [],
  );
  const acc = events.get("FAL-EQ-001");
  assertStrictEquals(acc?.hasContingency, true);
  assertStrictEquals((acc?.contingencySource ?? "").includes("conting"), true);
});
