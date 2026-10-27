// Regression tests for duplicate comments hidden by the details modal.
import { hasDistinctComments } from "./BarrierDetails.tsx";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("hasDistinctComments hides empty and duplicate event descriptions", () => {
  assertStrictEquals(hasDistinctComments("", "degradation"), false);
  assertStrictEquals(
    hasDistinctComments(" OS - 110386 ", "OS - 110386"),
    false,
  );
  assertStrictEquals(
    hasDistinctComments("Operator note", "OS - 110386"),
    true,
  );
});
