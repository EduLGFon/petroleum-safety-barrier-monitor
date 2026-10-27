// Regression tests for Fracttal-derived inventory fields and ownership.
// This synthetic asset mirrors only the fields needed to pin the observed
// hierarchy, SGI-LEC reference, and work-trade precedence.
import {
  deriveSheetFields,
  installLocalOf,
  originOf,
  OWNER_MAINTENANCE,
  OWNER_OPERATION,
  ownerIdOf,
  planFollowedOf,
} from "./sheet-fields.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import type { SheetAsset, SheetWork } from "./sheet-fields.ts";

const asset: SheetAsset = {
  active: true,
  description: "SDV-6520-003 Válv Shutdown LR-3603.0D001 { 1009435 } A",
  field_1: "SDV-6520-003 Válv Shutdown LR-3603.0D001",
  groups_description: "Válvula Shutdown",
  groups_2_description: "ESO",
  location_code: "SDV-6520-003",
  notes: "CÓD. SGI-LEC-0007 - REV.01",
  parent_description:
    '// Seacrest Petróleo/ Área Sul/ FAZENDA SÃO RAFAEL - FSR/ ESTAÇÃO COLETORA FAZENDA SÃO RAFAEL - FSR/ Sistema Escoamento de Gás - FSR/ Cj Lanç/Receb PIG Gasod 4" FSR x CBL - LR-3603.0D001 (FSR)/ SDV-6520-003 Válv Shutdown LR-3603.0D001/ ',
};

const instrumentCorrectiveWork: SheetWork = {
  planned: {
    date: "2026-10-08",
    source: "OS - 110386: Reestabelecer SDV",
    detail: "Plano de ação sintético",
    trade: "Instrumentação",
  },
};

Deno.test("installLocalOf returns the nearest hierarchy node above the asset", () => {
  assertStrictEquals(
    installLocalOf(asset),
    'Cj Lanç/Receb PIG Gasod 4" FSR x CBL - LR-3603.0D001 (FSR)',
  );
});

Deno.test("originOf extracts SGI-LEC references from asset notes", () => {
  assertStrictEquals(originOf(asset), "SGI-LEC-0007");
});

Deno.test("owner follows stable valve family before corrective work trade", () => {
  assertStrictEquals(
    ownerIdOf(asset, instrumentCorrectiveWork),
    OWNER_OPERATION,
  );
});

Deno.test("owner uses work trade when asset family is not classifiable", () => {
  assertStrictEquals(
    ownerIdOf(
      { groups_description: "Equipamento sem família mapeada" },
      instrumentCorrectiveWork,
    ),
    OWNER_MAINTENANCE,
  );
});

Deno.test("plan followed checks overdue preventive work, not corrective work", () => {
  assertStrictEquals(
    planFollowedOf(
      { id_group_task: 56275 },
      instrumentCorrectiveWork,
      "2026-10-26",
    ),
    "Sim",
  );
  assertStrictEquals(
    planFollowedOf(
      { id_group_task: 56275 },
      { preventive: { date: "2026-10-08", source: "preventiva" } },
      "2026-10-26",
    ),
    "Não",
  );
});

Deno.test("inventory derivation preserves the preventive plan definition", () => {
  const fields = deriveSheetFields(
    { ...asset, id_group_task: 56275 },
    instrumentCorrectiveWork,
    { availabilityId: 3, today: "2026-10-26" },
  );
  assertEquals(
    {
      origin: fields.origin,
      installLocal: fields.installLocal,
      planFollowed: fields.planFollowed,
    },
    {
      origin: "SGI-LEC-0007",
      installLocal:
        'Cj Lanç/Receb PIG Gasod 4" FSR x CBL - LR-3603.0D001 (FSR)',
      planFollowed: "Sim",
    },
  );
});
