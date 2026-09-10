// Unit tests for lib/api/query.ts - domain filters to wire query.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { buildQueryString, toWireQuery } from "./query.ts";

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
