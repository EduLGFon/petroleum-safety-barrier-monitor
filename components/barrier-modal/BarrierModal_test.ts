// Unit tests for the BarrierModal edit gate (pure helper, no DOM).
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { canEditBarrier } from "./BarrierModal.tsx";

Deno.test("canEditBarrier allows admins on live rows, including inactive ones", () => {
  assertStrictEquals(canEditBarrier({ deletedAt: null }, true), true);
  assertStrictEquals(canEditBarrier({}, true), true);
});

Deno.test("canEditBarrier refuses soft-deleted rows even for admins", () => {
  assertStrictEquals(
    canEditBarrier({ deletedAt: "2026-02-01T00:00:00Z" }, true),
    false,
  );
});

Deno.test("canEditBarrier refuses non-admins and missing barriers", () => {
  assertStrictEquals(canEditBarrier({ deletedAt: null }, false), false);
  assertStrictEquals(
    canEditBarrier({ deletedAt: "2026-02-01T00:00:00Z" }, false),
    false,
  );
  assertStrictEquals(canEditBarrier(null, true), false);
  assertStrictEquals(canEditBarrier(undefined, true), false);
});
