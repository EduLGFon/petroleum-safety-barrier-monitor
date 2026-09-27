// Unit tests for the Criticidade combo mapping (pure helpers, no DOM).
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
  CRIT_ONLY_OPTION,
  critComboOpts,
  critComboValue,
} from "./FilterBar.tsx";

Deno.test("critComboOpts pins the gate then ESO-first ranks", () => {
  assertEquals(critComboOpts(["D", "B", "ESO", "A", "C"]), [
    CRIT_ONLY_OPTION,
    "ESO",
    "A",
    "B",
    "C",
    "D",
  ]);
});

Deno.test("critComboOpts keeps novel labels after, in vocab order", () => {
  assertEquals(critComboOpts(["Zeta", "A", "Alfa"]), [
    CRIT_ONLY_OPTION,
    "A",
    "Zeta",
    "Alfa",
  ]);
});

Deno.test("critComboValue shows the gate only without an explicit rank", () => {
  assertStrictEquals(critComboValue("", true), CRIT_ONLY_OPTION);
  assertStrictEquals(critComboValue("B", true), "B");
  assertStrictEquals(critComboValue("", false), "");
  assertStrictEquals(critComboValue("ESO", false), "ESO");
});
