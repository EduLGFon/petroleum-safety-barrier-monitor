// Pure batch validation tests for access groups.
import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { validateAccessGroupBatch } from "./access-groups.ts";

Deno.test("access group batch validates delete", () => {
  const out = validateAccessGroupBatch({ action: "delete", ids: [1, 2] });
  assertEquals(out.action, "delete");
  assertEquals(out.groupIds, [1, 2]);
  assertEquals(out.relatedIds, []);
});

Deno.test("access group batch rejects too many group ids", () => {
  const ids = Array.from({ length: 201 }, (_, i) => i + 1);
  assertThrows(() => validateAccessGroupBatch({ action: "delete", ids }));
});

Deno.test("access group batch validates related ids and cross product", () => {
  const out = validateAccessGroupBatch({
    action: "addUsers",
    ids: [1, 2],
    userIds: [10, 20],
  });
  assertEquals(out.relatedIds, [10, 20]);
  assertThrows(() =>
    validateAccessGroupBatch({
      action: "addUsers",
      ids: Array.from({ length: 200 }, (_, i) => i + 1),
      userIds: Array.from({ length: 101 }, (_, i) => i + 1),
    })
  );
});

Deno.test("access group batch rejects cross product over 20000", () => {
  assertThrows(() =>
    validateAccessGroupBatch({
      action: "addLocations",
      ids: Array.from({ length: 200 }, (_, i) => i + 1),
      locationIds: Array.from({ length: 101 }, (_, i) => i + 1),
    })
  );
});

Deno.test("access group batch rejects too many related ids", () => {
  const ids = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(() =>
    validateAccessGroupBatch({ action: "addUsers", ids: [1], userIds: ids })
  );
});

Deno.test("access group batch rejects missing related ids", () => {
  assertThrows(() =>
    validateAccessGroupBatch({ action: "addUsers", ids: [1] })
  );
});

Deno.test("access group batch rejects unknown action", () => {
  assertThrows(() => validateAccessGroupBatch({ action: "nope", ids: [1] }));
});
