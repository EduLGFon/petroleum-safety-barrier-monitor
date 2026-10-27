// Regression tests for the text-only contingency recommendation rule.
import { shouldRecommendOutOfOperation } from "./contingency.ts";

import { assertStrictEquals } from "jsr:@std/assert@^1";

Deno.test("recommendation requires non-compliance and no eligible link", () => {
  assertStrictEquals(shouldRecommendOutOfOperation("Conforme", []), false);
  assertStrictEquals(shouldRecommendOutOfOperation("Não Conforme", []), true);
  assertStrictEquals(
    shouldRecommendOutOfOperation("Não Conforme", [{ eligible: false }]),
    true,
  );
  assertStrictEquals(
    shouldRecommendOutOfOperation("Não Conforme", [{ eligible: true }]),
    false,
  );
});
