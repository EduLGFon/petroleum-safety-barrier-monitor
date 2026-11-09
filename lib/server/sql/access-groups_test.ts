// Pure batch validation tests for access groups.
import { assertEquals, assertThrows } from "jsr:@std/assert@^1";

import { validateAccessGroupBatch } from "./access-groups.ts";

import { ValidationError } from "../validation.ts";

Deno.test("access group batch validates delete", () => {
  const out = validateAccessGroupBatch({ action: "delete", ids: [1, 2] });
  assertEquals(out.action, "delete");
  assertEquals(out.groupIds, [1, 2]);
  assertEquals(out.relatedIds, []);
});

Deno.test("access group batch accepts every canonical action", () => {
  const users = validateAccessGroupBatch({
    action: "addUsers",
    ids: [1],
    userIds: [10],
  });
  assertEquals(users.action, "addUsers");
  const removeUsers = validateAccessGroupBatch({
    action: "removeUsers",
    ids: [1],
    userIds: [10],
  });
  assertEquals(removeUsers.action, "removeUsers");
  const locations = validateAccessGroupBatch({
    action: "addLocations",
    ids: [1],
    locationIds: [20],
  });
  assertEquals(locations.action, "addLocations");
  const removeLocations = validateAccessGroupBatch({
    action: "removeLocations",
    ids: [1],
    locationIds: [20],
  });
  assertEquals(removeLocations.action, "removeLocations");
});

Deno.test("access group batch rejects too many group ids", () => {
  const ids = Array.from({ length: 201 }, (_, i) => i + 1);
  assertThrows(
    () => validateAccessGroupBatch({ action: "delete", ids }),
    ValidationError,
  );
});

Deno.test("access group batch validates related ids and cross product", () => {
  const out = validateAccessGroupBatch({
    action: "addUsers",
    ids: [1, 2],
    userIds: [10, 20],
  });
  assertEquals(out.relatedIds, [10, 20]);
  assertThrows(
    () =>
      validateAccessGroupBatch({
        action: "addUsers",
        ids: Array.from({ length: 200 }, (_, i) => i + 1),
        userIds: Array.from({ length: 101 }, (_, i) => i + 1),
      }),
    ValidationError,
  );
});

Deno.test("access group batch rejects cross product over 20000", () => {
  assertThrows(
    () =>
      validateAccessGroupBatch({
        action: "addLocations",
        ids: Array.from({ length: 200 }, (_, i) => i + 1),
        locationIds: Array.from({ length: 101 }, (_, i) => i + 1),
      }),
    ValidationError,
  );
});

Deno.test("access group batch rejects too many related ids", () => {
  const ids = Array.from({ length: 501 }, (_, i) => i + 1);
  assertThrows(
    () =>
      validateAccessGroupBatch({ action: "addUsers", ids: [1], userIds: ids }),
    ValidationError,
  );
});

Deno.test("access group batch rejects missing related ids", () => {
  assertThrows(
    () => validateAccessGroupBatch({ action: "addUsers", ids: [1] }),
    ValidationError,
  );
});

Deno.test("access group batch rejects unsafe ids", () => {
  assertThrows(
    () =>
      validateAccessGroupBatch({
        action: "addUsers",
        ids: [Number.MAX_SAFE_INTEGER + 1],
        userIds: [1],
      }),
    ValidationError,
  );
});

Deno.test("access group batch rejects unknown and removed actions", () => {
  assertThrows(
    () => validateAccessGroupBatch({ action: "nope", ids: [1] }),
    ValidationError,
  );
  assertThrows(
    () => validateAccessGroupBatch({ action: "addStations", ids: [1] }),
    ValidationError,
  );
});
