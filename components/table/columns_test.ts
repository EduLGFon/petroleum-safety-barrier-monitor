// Registry tests for components/table/columns.ts - defaults, sanitize and
// resolve rules for the switchable table columns.
import {
  DEFAULT_VISIBLE_COLS,
  defFor,
  resolveVisibleCols,
  sanitizeVisibleCols,
} from "./columns.ts";
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("registry defaults match the requested base order", () => {
  assertEquals(DEFAULT_VISIBLE_COLS, [
    "id",
    "tag",
    "typology",
    "location",
    "category",
    "availability",
    "compliance",
  ]);
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
