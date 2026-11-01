// Preset tests for context/settings/presets.ts - the font-size contract.
// The scales drive chart geometry and must stay in sync with the CSS
// [data-font-size] percentages.
import { DEFAULTS, FONT_SIZE_PRESETS } from "./presets.ts";

import { assertEquals } from "jsr:@std/assert@^1";

Deno.test("font-size presets expose exactly the four supported keys", () => {
  assertEquals(Object.keys(FONT_SIZE_PRESETS), [
    "small",
    "standard",
    "large",
    "xlarge",
  ]);
});

Deno.test("font-size scales match the CSS percentages", () => {
  assertEquals(
    Object.values(FONT_SIZE_PRESETS).map((p) => p.scale),
    [0.9375, 1, 1.125, 1.25],
  );
});

Deno.test("font size defaults to standard", () => {
  assertEquals(DEFAULTS.fontSize, "standard");
});
