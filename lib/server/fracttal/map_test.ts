// Unit tests for the Fracttal -> app barrier mapper (P3). Exact label
// resolution is the contract; unknown values skip with a reason, never guess.
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  IMPORT_DEFAULTS,
  mapAsset,
  type MapContext,
  type MappedRow,
} from "./map.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

import type { FracttalAsset } from "./types.ts";

const ctx: MapContext = {
  locationIds: { FAL: 1, "SANTA-MONICA": 2 },
  categoryIds: { "Sistema de Combate a Incêndio": 7 },
  criticalityIds: { "Crítico": 1, "Não Crítica": 2 },
};

function asset(over: Partial<FracttalAsset> = {}): FracttalAsset {
  return {
    id: 42,
    code: "FAL-EQ-001",
    active: true,
    available: true,
    id_type_item: 2,
    description: "teste",
    location_code: "fal",
    id_parent: null,
    items_types_description: "Equipment",
    groups_description: null,
    groups_1_description: "Sistema de Combate a Incêndio",
    groups_2_description: null,
    priorities_description: "Crítico",
    parent_description: null,
    units_description: null,
    is_serial_control: true,
    initial_date_out_of_service: null,
    last_final_date_available: null,
    ...over,
  };
}

Deno.test("availabilityFromAsset: unavailable is Indisponível, else Disponível", () => {
  const unavailable = mapAsset(asset({ available: false }), ctx);
  if (!unavailable.ok) throw new Error("expected ok");
  assertStrictEquals(
    unavailable.input.availabilityId,
    AVAILABILITY_UNAVAILABLE,
  );
  const available = mapAsset(asset({ available: true }), ctx);
  if (!available.ok) throw new Error("expected ok");
  assertStrictEquals(
    available.input.availabilityId,
    AVAILABILITY_AVAILABLE,
  );
});

Deno.test("mapAsset resolves labels case-insensitively and applies defaults", () => {
  const mapped = mapAsset(asset(), ctx);
  if (!mapped.ok) throw new Error("expected ok");
  assertStrictEquals(mapped.input.externalCode, "FAL-EQ-001");
  assertStrictEquals(mapped.input.tag, "FAL-EQ-001");
  assertStrictEquals(mapped.input.locationId, 1);
  assertStrictEquals(mapped.input.categoryId, 7);
  assertStrictEquals(mapped.input.criticalityId, 1);
  assertStrictEquals(mapped.input.typologyId, IMPORT_DEFAULTS.typologyId);
  assertStrictEquals(mapped.input.groupingId, IMPORT_DEFAULTS.groupingId);
  assertStrictEquals(mapped.input.locDescId, IMPORT_DEFAULTS.locDescId);
  assertStrictEquals(mapped.input.ownerId, null);
  assertStrictEquals(mapped.input.comments, "");
  assertStrictEquals(mapped.input.actionPlan, "");
  assertStrictEquals(mapped.input.sourceUpdatedAt, null);
});

Deno.test("mapAsset falls back to groups_description when groups_1 is absent", () => {
  const mapped = mapAsset(
    asset({
      groups_1_description: null,
      groups_description: "Sistema de Combate a Incêndio",
    }),
    ctx,
  );
  if (!mapped.ok) throw new Error("expected ok");
  assertStrictEquals(mapped.input.categoryId, 7);
});

const expectSkip = (mapped: MappedRow, fragment: string) => {
  assertStrictEquals(mapped.ok, false);
  if (mapped.ok) throw new Error("unreachable");
  assertStrictEquals(mapped.reason.includes(fragment), true, mapped.reason);
};

Deno.test("mapAsset skips empty external_code", () => {
  expectSkip(mapAsset(asset({ code: "  " }), ctx), "empty external_code");
});

Deno.test("mapAsset skips unknown locations", () => {
  expectSkip(
    mapAsset(asset({ location_code: "ZZZ" }), ctx),
    "unknown location",
  );
});

Deno.test("mapAsset skips unmapped category labels", () => {
  expectSkip(
    mapAsset(asset({ groups_1_description: "Typo Isolada" }), ctx),
    "unmapped category",
  );
});

Deno.test("mapAsset skips unmapped criticality labels", () => {
  expectSkip(
    mapAsset(asset({ priorities_description: "Sem Prioridade" }), ctx),
    "unmapped criticality",
  );
});
