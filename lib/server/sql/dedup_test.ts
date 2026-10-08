// Dedup helpers - pure unit tests (no database required).
// This is why it exists: the sync lease, audit, and status guards all
// depend on small pure predicates; a regression here silently reopens
// duplicate-write races, so they are pinned without needing Postgres.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { isUniqueViolation } from "./sync.ts";

Deno.test("isUniqueViolation matches SQLSTATE code shape", () => {
  assertStrictEquals(isUniqueViolation({ code: "23505" }), true);
  assertStrictEquals(isUniqueViolation({ code: "23503" }), false);
});

Deno.test("isUniqueViolation matches driver message shapes", () => {
  assertStrictEquals(
    isUniqueViolation(
      new Error(
        'duplicate key value violates unique constraint "uniq_sync_changes_run_barrier"',
      ),
    ),
    true,
  );
  assertStrictEquals(
    isUniqueViolation(new Error("connection refused")),
    false,
  );
  assertStrictEquals(isUniqueViolation(null), false);
});
