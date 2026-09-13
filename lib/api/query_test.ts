// Unit tests for lib/api/query.ts - domain filters to wire query.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { buildQueryString, cleanDateParam, toWireQuery } from "./query.ts";

Deno.test("toWireQuery encodes known values to ids", () => {
  const q = toWireQuery({
    location: "FAL",
    disponibilidade: "Degradado",
    page: 2,
    pageSize: 25,
  });
  assertEquals(q, {
    locationId: 1,
    disponibilidadeId: 4,
    page: 2,
    pageSize: 25,
  });
});

Deno.test("toWireQuery skips ALL location and unknown values", () => {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => warnings.push(m);
  try {
    const q = toWireQuery({ location: "ALL", categoria: "Nope" });
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
      disponibilidade: "Futuro",
      conformidade: "Em análise",
      categoria: "Nope",
    });
    assertEquals(q, {});
  });
  assertStrictEquals(warnings.length, 4);
  assertStrictEquals(warnings[0], "[toWireQuery] unknown location: MARS");
});

Deno.test("toWireQuery drops invalid disponibilidade/conformidade but keeps the rest", () => {
  const warnings = collectWarnings(() => {
    const q = toWireQuery({
      disponibilidade: "Degradado", // known - id 4
      conformidade: "Raro",
      query: "pump",
      sortCol: "tag",
      sortDir: "desc",
    });
    assertEquals(q, {
      disponibilidadeId: 4,
      query: "pump",
      sortCol: "tag",
      sortDir: "desc",
    });
  });
  assertStrictEquals(warnings.length, 1);
  assertEquals(warnings[0], "[toWireQuery] unknown conformidade: Raro");
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
    location: "SPL",
    categoria: "Detector de H₂S",
    query: "",
    page: 2,
    pageSize: 50,
    sortCol: "statusSince",
    sortDir: "asc",
  });
  assertEquals(q, {
    locationId: 6,
    categoriaId: 9,
    page: 2,
    pageSize: 50,
    sortCol: "statusSince",
    sortDir: "asc",
  });
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
