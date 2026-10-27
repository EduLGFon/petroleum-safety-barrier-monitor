// Registry tests for components/table/columns.ts - defaults, sanitize and
// resolve rules for the switchable table columns.
import {
  DEFAULT_VISIBLE_COLS,
  defFor,
  resolveVisibleCols,
  sanitizeVisibleCols,
} from "./columns.ts";
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";
import { renderToString } from "preact-render-to-string";
import { createElement as h } from "preact";
import { BarrierRow } from "./BarrierRow.tsx";
import type { Barrier } from "../../lib/types.ts";

Deno.test("registry defaults match the requested base order", () => {
  assertEquals(DEFAULT_VISIBLE_COLS, [
    "id",
    "tag",
    "typology",
    "location",
    "category",
    "availability",
    "compliance",
    "contingency",
  ]);
});

Deno.test("defFor returns Contingência for contingency key", () => {
  assertEquals(defFor("contingency"), {
    key: "contingency",
    label: "Contingência",
    filter: "none",
  });
});

Deno.test("defFor falls back to TAG on corrupt keys", () => {
  assertStrictEquals(defFor("category").label, "Categoria");
  assertStrictEquals(
    defFor("nope" as never).label,
    defFor("tag").label,
  );
});

Deno.test("sanitizeVisibleCols keeps known keys in order, drops rest", () => {
  assertEquals(
    sanitizeVisibleCols(["tag", "nope", "id", "tag", 7]),
    ["tag", "id"],
  );
  assertStrictEquals(sanitizeVisibleCols("tag"), undefined);
  assertStrictEquals(sanitizeVisibleCols(null), undefined);
});

Deno.test("resolveVisibleCols keeps stored order, defaults on empty", () => {
  // A missing key means the user hid it: never re-added.
  assertEquals(resolveVisibleCols(["tag", "id"]), ["tag", "id"]);
  assertEquals(resolveVisibleCols([]), [...DEFAULT_VISIBLE_COLS]);
  assertEquals(resolveVisibleCols(undefined), [...DEFAULT_VISIBLE_COLS]);
  assertEquals(resolveVisibleCols(["nope"]), [...DEFAULT_VISIBLE_COLS]);
  assert(resolveVisibleCols(["compliance"]).length === 1);
});

Deno.test("BarrierRow renders contingency tag when present and '-' when absent", () => {
  const dummyBarrier = (contingency?: string): Barrier => ({
    id: 1,
    tag: "TAG-001",
    typology: "Tip",
    location: "FAL",
    locDesc: "Desc",
    criticality: "A",
    category: "Cat",
    grouping: "Grp",
    owner: "Own",
    availability: "Disponível",
    compliance: "Conforme",
    comments: "",
    actionPlan: "",
    statusSince: "2026-01-01",
    statusHistory: [],
    origin: "",
    externalCode: "100",
    locationName: "Loc",
    installLocal: "Inst",
    equipTypology: "Equip",
    fieldInstalled: "Sim",
    fieldOperational: "Sim",
    opStatus: "Disponível",
    hasMaintPlan: "Sim",
    planFollowed: "Sim",
    failureFree: "Sim",
    maintStatus: "Disponível",
    hasContingency: "Sim",
    contingencyDesc: "",
    contingency,
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
  });

  const htmlWithTag = renderToString(
    h(BarrierRow, {
      barrier: dummyBarrier("TAG-CONT-88"),
      index: 0,
      selected: false,
      visibleCols: ["contingency"],
      onToggleSelect: () => {},
      onSelect: () => {},
    }),
  );
  assert(htmlWithTag.includes("TAG-CONT-88"));

  const htmlWithoutTag = renderToString(
    h(BarrierRow, {
      barrier: dummyBarrier(""),
      index: 0,
      selected: false,
      visibleCols: ["contingency"],
      onToggleSelect: () => {},
      onSelect: () => {},
    }),
  );
  assert(htmlWithoutTag.includes(">-<"));
});
