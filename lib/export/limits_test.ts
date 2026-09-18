// Unit tests for shared export refusal message.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { refusalMessage } from "./limits.ts";

import { MAX_DOM_ROWS } from "./html.ts";

Deno.test("refusalMessage mentions format and counts", () => {
  const msg = refusalMessage("PDF", MAX_DOM_ROWS + 1);
  assert(msg.startsWith("PDF comporta até"));
  assert(msg.includes("Filtre mais ou exporte CSV"));
  assertStrictEquals(
    refusalMessage("Excel", 0).startsWith("Excel comporta até"),
    true,
  );
});
