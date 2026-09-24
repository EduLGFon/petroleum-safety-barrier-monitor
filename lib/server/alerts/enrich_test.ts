// Unit tests for barrier detail enrichment (premium mail payload).
import { extractDetail } from "./enrich.ts";

import type { WireBarrier } from "../../wireTypes.ts";

function wire(over: Partial<WireBarrier> = {}): WireBarrier {
  return {
    id: 7,
    tag: "FAL-EQ-001",
    typologyId: 0,
    locationId: 0,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 0,
    groupingId: 0,
    ownerId: -1,
    availabilityId: 5,
    comments: "",
    actionPlan: "trocar gaxeta",
    statusSince: "2026-09-13",
    statusHistory: [],
    origin: "",
    externalCode: "",
    locationName: "Terminal Norte",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
    ...over,
  };
}

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("extractDetail attributes the matching transition author", () => {
  const detail = extractDetail(
    wire({
      statusHistory: [
        { date: "2026-09-10", statusId: 0, authorId: 10, note: "" },
        {
          date: "2026-09-13",
          statusId: 5,
          authorId: 11,
          note: "vazamento observado",
        },
      ],
    }),
    "2026-09-13",
    5,
    { authors: { 11: "Eduardo" } },
  );
  assertStrictEquals(detail.author, "Eduardo");
  assertStrictEquals(detail.note, "vazamento observado");
  assertStrictEquals(detail.actionPlan, "trocar gaxeta");
  assertStrictEquals(detail.locationName, "Terminal Norte");
});

Deno.test("extractDetail hides service and unknown authors", () => {
  const sync = extractDetail(
    wire({
      statusHistory: [{
        date: "2026-09-13",
        statusId: 5,
        authorId: 10,
        note: "",
      }],
    }),
    "2026-09-13",
    5,
  );
  assertStrictEquals(sync.author, undefined);
  const unknown = extractDetail(
    wire({
      statusHistory: [{
        date: "2026-09-13",
        statusId: 5,
        authorId: 99,
        note: "",
      }],
    }),
    "2026-09-13",
    5,
  );
  assertStrictEquals(unknown.author, undefined);
});

Deno.test("extractDetail falls back to the latest entry without history match", () => {
  const detail = extractDetail(
    wire({
      statusHistory: [{
        date: "2026-09-01",
        statusId: 1,
        authorId: 0,
        note: "hi",
      }],
    }),
    "2026-09-13",
    5,
  );
  assertStrictEquals(detail.author, "João Silva");
  assertStrictEquals(detail.note, "hi");
});
