// Pure batch validation tests for access groups.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@^1";

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

Deno.test("access group batch rejects alias request keys", () => {
  assertThrows(
    () => validateAccessGroupBatch({ action: "delete", groupIds: [1] }),
    ValidationError,
  );
  assertThrows(
    () =>
      validateAccessGroupBatch({
        action: "addUsers",
        ids: [1],
        users: [10],
      }),
    ValidationError,
  );
  assertThrows(
    () =>
      validateAccessGroupBatch({
        action: "addLocations",
        ids: [1],
        locations: [20],
      }),
    ValidationError,
  );
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

Deno.test("listAccessGroups passes limit and offset to the groups query", async () => {
  const { listAccessGroups } = await import("./access-groups.ts");
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const globals = globalThis as unknown as { __barrierPool?: unknown };
  const previous = globals.__barrierPool;
  const groupRow = {
    id: 1,
    name: "Ops",
    description: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  globals.__barrierPool = {
    connect: () =>
      Promise.resolve({
        queryObject: (text: string, args: unknown[] = []) => {
          seen.push({ text, args });
          if (text.includes("from access_groups")) {
            return Promise.resolve({ rows: [groupRow] });
          }
          return Promise.resolve({ rows: [] });
        },
        release: () => {},
      }),
    end: () => Promise.resolve(),
  };
  try {
    const groups = await listAccessGroups(10, 20);
    assertEquals(groups.length, 1);
    const groupsQuery = seen.find((q) => q.text.includes("from access_groups"));
    assertEquals(groupsQuery?.args, [10, 20]);
    assert(groupsQuery?.text.includes("limit $1"), "limit placeholder");
    assert(groupsQuery?.text.includes("offset $2"), "offset placeholder");
  } finally {
    globals.__barrierPool = previous;
  }
});

Deno.test("listAccessGroups without pagination keeps the unbounded query", async () => {
  const { listAccessGroups } = await import("./access-groups.ts");
  const seen: Array<{ text: string; args: unknown[] }> = [];
  const globals = globalThis as unknown as { __barrierPool?: unknown };
  const previous = globals.__barrierPool;
  globals.__barrierPool = {
    connect: () =>
      Promise.resolve({
        queryObject: (text: string, args: unknown[] = []) => {
          seen.push({ text, args });
          return Promise.resolve({ rows: [] });
        },
        release: () => {},
      }),
    end: () => Promise.resolve(),
  };
  try {
    await listAccessGroups();
    const groupsQuery = seen.find((q) => q.text.includes("from access_groups"));
    assertEquals(groupsQuery?.args, []);
    assert(!groupsQuery?.text.includes("limit"), "no limit clause");
  } finally {
    globals.__barrierPool = previous;
  }
});
