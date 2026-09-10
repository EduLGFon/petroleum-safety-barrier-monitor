// Unit tests for lib/server/sql/where.ts - safe WHERE/ORDER building.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { buildWhere, resolveOrderBy } from "./where.ts";

Deno.test("resolveOrderBy whitelists columns, coerces direction", () => {
  assertStrictEquals(resolveOrderBy("tag", "desc"), "b.tag desc");
  assertStrictEquals(resolveOrderBy("hacker", "desc"), "b.id desc");
  assertStrictEquals(resolveOrderBy("id", "sideways"), "b.id asc");
  assertStrictEquals(resolveOrderBy(undefined, undefined), "b.id asc");
});

Deno.test("buildWhere is empty without filters", () => {
  assertEquals(buildWhere({}), { text: "", args: [] });
});

Deno.test("buildWhere binds ids as numbered args", () => {
  const { text, args } = buildWhere({ locationId: 1, categoriaId: 4 });
  assertEquals(args, [1, 4]);
  assert(text.includes("b.location_id = $1"));
  assert(text.includes("b.categoria_id = $2"));
});

Deno.test("buildWhere escapes LIKE wildcards", () => {
  const { text, args } = buildWhere({ query: "100%_x" });
  assertEquals(args, ["%100\\%\\_x%", "%100\\%\\_x%"]);
  assert(text.includes("escape '\\'"));
});

Deno.test("buildWhere adds ISO date bounds", () => {
  const { text, args } = buildWhere({
    since: "2026-01-01",
    until: "2026-02-01",
  });
  assertEquals(args, ["2026-01-01", "2026-02-01"]);
  assert(text.includes("b.status_since >="));
  assert(text.includes("b.status_since <="));
});
