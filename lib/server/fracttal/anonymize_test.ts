// Unit tests for fixture anonymization - free-text is nulled, structural
// mapping fields survive, tenant codes are unlinked.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { anonymizeAsset } from "./anonymize.ts";
import type { FracttalAsset } from "./types.ts";

const base: FracttalAsset = {
  id: 42,
  code: "PK-EST-42",
  active: true,
  available: false,
  id_type_item: 2,
  description: "Bomba Centrífuga Casa de Força",
  location_code: "ST-ALFA",
  id_parent: 5,
  items_types_description: "Equipment",
  groups_description: "Sistemas",
  groups_1_description: "Geração",
  groups_2_description: "Bombas",
  priorities_description: "Crítico",
  parent_description: "Localizada em Casa de Força 2",
  units_description: "ST",
  is_serial_control: true,
  initial_date_out_of_service: "2026-01-10",
  last_final_date_available: "2026-01-09",
};

Deno.test("anonymizeAsset nulls the free-text fields", () => {
  const clean = anonymizeAsset(base);
  assertStrictEquals(clean.description, null);
  assertStrictEquals(clean.parent_description, null);
});

Deno.test("anonymizeAsset unlinks the tenant code but keeps a stable suffix", () => {
  const clean = anonymizeAsset(base);
  assertStrictEquals(clean.code, "anon-42");
});

Deno.test("anonymizeAsset keeps the structural mapping fields", () => {
  const clean = anonymizeAsset(base);
  assertStrictEquals(clean.id, 42);
  assertStrictEquals(clean.active, true);
  assertStrictEquals(clean.available, false);
  assertStrictEquals(clean.id_type_item, 2);
  assertStrictEquals(clean.groups_1_description, "Geração");
  assertStrictEquals(clean.groups_2_description, "Bombas");
  assertStrictEquals(clean.priorities_description, "Crítico");
  assertStrictEquals(clean.location_code, "ST-ALFA");
  assertStrictEquals(clean.initial_date_out_of_service, "2026-01-10");
});
