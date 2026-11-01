// Unit tests for lib/field-ownership.ts - pure ownership helpers.
import {
  FIELD_COLUMNS,
  FRACTTAL_SOURCES,
  isOwnableField,
  mergeOwnership,
  OWNABLE_FIELD_KEYS,
} from "./field-ownership.ts";

import { assert, assertEquals } from "jsr:@std/assert@^1";

Deno.test("isOwnableField accepts PATCH-editable keys only", () => {
  assert(isOwnableField("origin"));
  assert(isOwnableField("tag"));
  assert(isOwnableField("extraComments"));
  assert(!isOwnableField("availabilityId"));
  assert(!isOwnableField("isActive"));
  assert(!isOwnableField("locDescId"));
  assert(!isOwnableField("scopeSource"));
  assert(!isOwnableField("manualFields"));
  assert(!isOwnableField(123));
  assert(!isOwnableField(null));
});

Deno.test("mergeOwnership unions edited, drops released, sanitizes", () => {
  assertEquals(mergeOwnership([], ["origin", "tag"], []), ["origin", "tag"]);
  assertEquals(
    mergeOwnership(["origin", "tag"], [], ["origin"]),
    ["tag"],
  );
  // Releasing a key that was edited in the same PATCH wins (release applies
  // after the union, so "voltar ao sync" never re-locks by accident).
  assertEquals(mergeOwnership([], ["origin"], ["origin"]), []);
  // Stored junk from a future/older shape is dropped, output is sorted.
  assertEquals(
    mergeOwnership(["tag", "availabilityId", "origin"], [], []),
    ["origin", "tag"],
  );
});

Deno.test("every ownable key has a column and a Fracttal source", () => {
  for (const k of OWNABLE_FIELD_KEYS) {
    assert(
      typeof FIELD_COLUMNS[k] === "string" && FIELD_COLUMNS[k].length > 0,
      `missing column for ${k}`,
    );
    assert(
      typeof FRACTTAL_SOURCES[k]?.field === "string" &&
        FRACTTAL_SOURCES[k].field.length > 0,
      `missing source for ${k}`,
    );
    assert(
      typeof FRACTTAL_SOURCES[k]?.hint === "string" &&
        FRACTTAL_SOURCES[k].hint.length > 0,
      `missing hint for ${k}`,
    );
  }
});
