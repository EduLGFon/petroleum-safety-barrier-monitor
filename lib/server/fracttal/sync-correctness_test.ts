// Regression tests for Fracttal/sync correctness fixes:
// urgent-gated failure-free/degradation, WO priority urgency, live/import
// open-parity, contingency key parity, and audit snapshot symmetry.
import { hasUrgentCorrective } from "./barrier-rules.ts";

import {
  deriveSheetFields,
  failureFreeOf,
  type SheetWork,
} from "./sheet-fields.ts";

import {
  contingencyFromRaw,
  isOpenWorkOrderRow,
  parseWorkOrder,
  urgentFromPriority,
  workOrderSlot,
} from "./work.ts";

import { mapAsset, type MapContext } from "./map.ts";

import { createFracttalClient } from "./client.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("hasUrgentCorrective gates on urgent or isUrgent planned only", () => {
  assertStrictEquals(
    hasUrgentCorrective({ urgent: { date: null, source: "u" }, planned: null }),
    true,
  );
  assertStrictEquals(
    hasUrgentCorrective({
      urgent: null,
      planned: { date: null, source: "p", isUrgent: true },
    }),
    true,
  );
  assertStrictEquals(
    hasUrgentCorrective({
      urgent: null,
      planned: { date: null, source: "p" },
    }),
    false,
  );
  assertStrictEquals(
    hasUrgentCorrective({ urgent: null, planned: null }),
    false,
  );
});

Deno.test("failureFree non-urgent planned stays Sim", () => {
  const nonUrgent: SheetWork = {
    urgent: null,
    planned: { date: "2026-09-11", source: "OS - 1: fix" },
  };
  assertStrictEquals(failureFreeOf(nonUrgent), "Sim");
  const urgentPlanned: SheetWork = {
    urgent: null,
    planned: { date: "2026-09-11", source: "OS - 1: fix", isUrgent: true },
  };
  assertStrictEquals(failureFreeOf(urgentPlanned), "Não");
  const urgent: SheetWork = {
    urgent: { date: "2026-09-11", source: "OS - 2: fail" },
    planned: null,
  };
  assertStrictEquals(failureFreeOf(urgent), "Não");
  assertStrictEquals(failureFreeOf({}), "Sim");
});

Deno.test("deriveSheetFields non-urgent planned leaves degradation/action empty", () => {
  const asset = { description: "Válvula", field_1: "Válvula" };
  const nonUrgent: SheetWork = {
    urgent: null,
    planned: { date: "2026-09-11", source: "OS - 1: fix" },
  };
  const fields = deriveSheetFields(asset, nonUrgent, {
    availabilityId: 0,
    today: "2026-09-15",
  });
  assertStrictEquals(fields.failureFree, "Sim");
  assertStrictEquals(fields.degradationDesc, "");
  assertStrictEquals(fields.actionPlan, "");
  const urgentPlanned: SheetWork = {
    urgent: null,
    planned: {
      date: "2026-09-11",
      source: "OS - 1: fix",
      detail: "trocar gaxeta",
      isUrgent: true,
    },
  };
  const urgentFields = deriveSheetFields(asset, urgentPlanned, {
    availabilityId: 4,
    today: "2026-09-15",
  });
  assertStrictEquals(urgentFields.failureFree, "Não");
  assertStrictEquals(urgentFields.degradationDesc !== "", true);
  assertStrictEquals(urgentFields.actionPlan !== "", true);
});

Deno.test("urgentFromPriority maps VERY_HIGH/HIGH/emergencia to urgent", () => {
  assertStrictEquals(urgentFromPriority("VERY_HIGH"), true);
  assertStrictEquals(urgentFromPriority("very_high"), true);
  assertStrictEquals(urgentFromPriority("HIGH"), true);
  assertStrictEquals(urgentFromPriority("High"), true);
  assertStrictEquals(urgentFromPriority("Emergência"), true);
  assertStrictEquals(urgentFromPriority("EMERGENCIAL"), true);
  assertStrictEquals(urgentFromPriority("URGENTE"), true);
  assertStrictEquals(urgentFromPriority("MEDIUM"), false);
  assertStrictEquals(urgentFromPriority("LOW"), false);
  assertStrictEquals(urgentFromPriority(""), false);
  assertStrictEquals(urgentFromPriority(null), false);
});

function wo(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    code: "FAL-EQ-001",
    done: false,
    id_status_work_order: null,
    tasks_log_types_description: "CORR - Corretiva Planejada",
    wo_folio: "OS - 9001",
    description: "Sanar falha",
    date_maintenance: "2026-09-10",
    creation_date: "2026-09-09",
    ...over,
  };
}

Deno.test("workOrderSlot id_status parity: done/status share one predicate", () => {
  // Open: done===false OR status in (1,2).
  assertStrictEquals(isOpenWorkOrderRow(false, null), true);
  assertStrictEquals(isOpenWorkOrderRow(null, 1), true);
  assertStrictEquals(isOpenWorkOrderRow(null, 2), true);
  assertStrictEquals(isOpenWorkOrderRow(false, 1), true);
  // Closed: done===true OR status===4, closed wins.
  assertStrictEquals(isOpenWorkOrderRow(true, null), false);
  assertStrictEquals(isOpenWorkOrderRow(null, 4), false);
  assertStrictEquals(isOpenWorkOrderRow(false, 4), false);
  assertStrictEquals(isOpenWorkOrderRow(true, 1), false);
  assertStrictEquals(isOpenWorkOrderRow(null, null), false);
  // Slot level: status-only open rows classify; status-4 rows close.
  const byStatus = workOrderSlot(
    parseWorkOrder(wo({ done: null, id_status_work_order: 1 })),
  );
  assertStrictEquals(byStatus?.planned !== null, true);
  assertStrictEquals(
    workOrderSlot(parseWorkOrder(wo({ done: false, id_status_work_order: 4 }))),
    null,
  );
  assertStrictEquals(
    workOrderSlot(parseWorkOrder(wo({ done: true, id_status_work_order: 1 }))),
    null,
  );
});

Deno.test("workOrderSlot planned with HIGH priority carries isUrgent", () => {
  // default (no priority) carries no urgent flag
  const def = workOrderSlot(parseWorkOrder(wo()));
  assertStrictEquals(def?.planned?.isUrgent, false);
  const slot = workOrderSlot(
    parseWorkOrder(wo({ priorities_description: "HIGH" })),
  );
  assertStrictEquals(slot?.planned?.isUrgent, true);
  assertStrictEquals(slot?.planned?.priority, "HIGH");
  const low = workOrderSlot(
    parseWorkOrder(wo({ priorities_description: "LOW" })),
  );
  assertStrictEquals(low?.planned?.isUrgent, false);
});

Deno.test("contingencyFromRaw covers note singular and object labels", () => {
  assertStrictEquals(contingencyFromRaw({ note: "GM-123" }), true);
  assertStrictEquals(
    contingencyFromRaw({ labels: [{ description: "CEC anexado" }] }),
    true,
  );
  assertStrictEquals(contingencyFromRaw({ labels: [{ name: "gm-9" }] }), true);
  assertStrictEquals(
    contingencyFromRaw({ custom_description: "contingência aplicada" }),
    true,
  );
  assertStrictEquals(contingencyFromRaw({ note: "rotina" }), false);
});

const ctx: MapContext = {
  locationIds: { FAL: 1 },
  categoryIds: { "Sistema de Combate a Incêndio": 7 },
  criticalityIds: { ESO: 0, A: 1, B: 2, C: 3, D: 4 },
};

function assetBase(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    code: "FAL-EQ-001",
    active: true,
    available: true,
    id_type_item: 2,
    description: "Casa de Bombas { FAL-EQ-001 } A",
    location_code: "FAL",
    id_parent: null,
    items_types_description: "Equipment",
    groups_description: "Sistema de Combate a Incêndio",
    groups_1_description: "Polo",
    groups_2_description: null,
    priorities_description: null,
    parent_description: null,
    units_description: null,
    is_serial_control: true,
    initial_date_out_of_service: null,
    last_final_date_available: null,
    field_1: null,
    field_2: null,
    field_3: null,
    field_4: null,
    field_5: null,
    field_6: null,
    notes: null,
    id_group_task: null,
    groups_tasks_description: null,
    ...over,
  };
}

Deno.test("mapAsset non-urgent planned stays available with explanatory history", () => {
  const mapped = mapAsset(
    assetBase(),
    ctx,
    {
      work: { planned: { date: "2026-09-11", source: "OS - 1: fix" } },
      today: "2026-09-15",
    },
  );
  if (!mapped.ok) throw new Error("expected ok");
  assertStrictEquals(mapped.input.availabilityId, 0);
  assertStrictEquals(mapped.input.failureFree, "Sim");
  assertStrictEquals(mapped.input.degradationDesc, "");
  assertEquals(
    mapped.input.history.note.includes("sem marcador de urgência"),
    true,
  );
  // Explicit Não default (M1/M2): no stripped contingency.
  assertStrictEquals(mapped.input.hasContingency, "Não");
});

Deno.test("mapAsset urgent planned degrades with failure flag", () => {
  const mapped = mapAsset(
    assetBase(),
    ctx,
    {
      work: {
        planned: { date: "2026-09-11", source: "OS - 1: fix", isUrgent: true },
      },
      today: "2026-09-15",
    },
  );
  if (!mapped.ok) throw new Error("expected ok");
  assertStrictEquals(mapped.input.availabilityId, 4);
  assertStrictEquals(mapped.input.failureFree, "Não");
  assertStrictEquals(mapped.input.degradationDesc !== "", true);
});

Deno.test("fetchRawItem accepts an object envelope as well as an array", async () => {
  const row = { code: "EQ-001", id: 1 };
  const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/oauth/token")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "t",
            refresh_token: "r",
            expires_in: 7200,
          }),
          { status: 200 },
        ),
      );
    }
    if (url.includes("/items/EQ-OBJ")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: row }), {
          status: 200,
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data: [row] }), {
        status: 200,
      }),
    );
  };
  const client = createFracttalClient({
    baseUrl: "https://app.fracttal.com/api",
    credentials: { key: "k", secret: "s" },
    fetchImpl,
  });
  const fromObject = await client.fetchRawItem("EQ-OBJ");
  assertEquals((fromObject.row as Record<string, unknown>)?.code, "EQ-001");
  const fromArray = await client.fetchRawItem("EQ-ARR");
  assertEquals((fromArray.row as Record<string, unknown>)?.code, "EQ-001");
});
