// Unit tests for lib/api/query.ts - domain filters to wire query.
import { buildQueryString, cleanDateParam, toWireQuery } from "./query.ts";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("toWireQuery encodes known values to ids", () => {
  const q = toWireQuery({
    location: "FAL",
    availability: "Degradado",
    page: 2,
    pageSize: 25,
  });
  assertEquals(q, {
    locationId: 1,
    availabilityId: 4,
    page: 2,
    pageSize: 25,
  });
});

Deno.test("toWireQuery skips ALL location and unknown values", () => {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => warnings.push(m);
  try {
    const q = toWireQuery({ location: "ALL", category: "Nope" });
    assertEquals(q, {});
    assertStrictEquals(warnings.length, 1);
  } finally {
    console.warn = orig;
  }
});

Deno.test("toWireQuery keeps valid ISO dates, drops malformed", () => {
  const q = toWireQuery({ since: "2026-01-01", until: "tomorrow" });
  assertEquals(q, { since: "2026-01-01" });
});

Deno.test("buildQueryString skips empty values", () => {
  assertStrictEquals(
    buildQueryString({ locationId: 1, query: "", page: 1 }),
    "locationId=1&page=1",
  );
  assertStrictEquals(buildQueryString({}), "");
});

function collectWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => warnings.push(m);
  try {
    fn();
  } finally {
    console.warn = orig;
  }
  return warnings;
}

Deno.test("toWireQuery warns and skips each unknown vocabulary value", () => {
  const warnings = collectWarnings(() => {
    const q = toWireQuery({
      location: "MARS",
      availability: "Futuro",
      compliance: "Em análise",
      category: "Nope",
    });
    assertEquals(q, {});
  });
  assertStrictEquals(warnings.length, 4);
  assertStrictEquals(warnings[0], "[toWireQuery] unknown location: MARS");
});

Deno.test("toWireQuery drops invalid availability/compliance but keeps the rest", () => {
  const warnings = collectWarnings(() => {
    const q = toWireQuery({
      availability: "Degradado", // known - id 4
      compliance: "Raro",
      query: "pump",
      sortCol: "tag",
      sortDir: "desc",
    });
    assertEquals(q, {
      availabilityId: 4,
      query: "pump",
      sortCol: "tag",
      sortDir: "desc",
    });
  });
  assertStrictEquals(warnings.length, 1);
  assertEquals(warnings[0], "[toWireQuery] unknown compliance: Raro");
});

Deno.test("cleanDateParam accepts bare or longer ISO dates, rejects garbage", () => {
  assertStrictEquals(cleanDateParam("2026-01-02"), "2026-01-02");
  assertStrictEquals(cleanDateParam("2026-01-02T10:30:00.000Z"), "2026-01-02");
  assertStrictEquals(cleanDateParam(undefined), undefined);
  assertStrictEquals(cleanDateParam(""), undefined);
  assertStrictEquals(cleanDateParam("tomorrow"), undefined);
  assertStrictEquals(cleanDateParam("2026-1-1"), undefined);
  assertStrictEquals(cleanDateParam("20-01-01"), undefined);
  // Shape-only validation: month/day values are not calendar-checked here.
  assertStrictEquals(cleanDateParam("2026-13-40"), "2026-13-40");
});

Deno.test("toWireQuery passes through known ids with pageSize/sort intact", () => {
  const q = toWireQuery({
    location: "CNC",
    category: "Detectores Fixos de F&G",
    query: "",
    page: 2,
    pageSize: 50,
    sortCol: "statusSince",
    sortDir: "asc",
  });
  assertEquals(q, {
    locationId: 6,
    categoryId: 4,
    page: 2,
    pageSize: 50,
    sortCol: "statusSince",
    sortDir: "asc",
  });
});

Deno.test("toWireQuery maps plan presence to hasActionPlan", () => {
  assertEquals(toWireQuery({ plan: "Com plano" }), { hasActionPlan: true });
  assertEquals(toWireQuery({ plan: "Sem plano" }), { hasActionPlan: false });
  assertEquals(toWireQuery({ plan: "" }), {});
  const warnings = collectWarnings(() => {
    assertEquals(toWireQuery({ plan: "Talvez" }), {});
  });
  assertStrictEquals(warnings.length, 1);
});

Deno.test("toWireQuery maps criticality to id, warns on unknown", () => {
  assertEquals(toWireQuery({ criticality: "Crítica" }), { criticalityId: 1 });
  const warnings = collectWarnings(() => {
    assertEquals(toWireQuery({ criticality: "Talvez" }), {});
  });
  assertStrictEquals(warnings.length, 1);
});

Deno.test("toWireQuery uses dynamic id overrides for location and category", () => {
  const q = toWireQuery(
    { location: "SM", category: "Válvula XV" },
    { locationIds: { SM: 21 }, categoryIds: { "Válvula XV": 33 } },
  );
  assertEquals(q, { locationId: 21, categoryId: 33 });
});

Deno.test("toWireQuery falls back to static enums when overrides omit the value", () => {
  const q = toWireQuery(
    { location: "FAL", category: "Detectores Fixos de F&G" },
    { locationIds: { SM: 21 }, categoryIds: { "Válvula XV": 33 } },
  );
  assertEquals(q, { locationId: 1, categoryId: 4 });
});

Deno.test("toWireQuery warns on unknown values even with overrides present", () => {
  const warnings = collectWarnings(() => {
    const q = toWireQuery(
      { location: "MARS" },
      { locationIds: { SM: 21 } },
    );
    assertEquals(q, {});
  });
  assertStrictEquals(warnings.length, 1);
});

Deno.test("buildQueryString encodes query/date/sort params", () => {
  const row = buildQueryString({
    locationId: 1,
    query: "pump skid",
    page: 2,
    since: "2026-01-01",
    sortCol: "statusSince",
    sortDir: "desc",
  });
  assertEquals(
    row,
    "locationId=1&query=pump+skid&page=2&since=2026-01-01&sortCol=statusSince&sortDir=desc",
  );
});
