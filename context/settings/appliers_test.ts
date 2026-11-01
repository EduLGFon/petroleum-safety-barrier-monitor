// Applier tests for context/settings/appliers.ts - dataset side effects.
// Font size is applied through data-font-size so CSS owns the root percentage.
import { applyFontSize } from "./appliers.ts";
import type { FontSize } from "./presets.ts";

import { assertEquals } from "jsr:@std/assert@^1";

import { setupDom } from "../../scripts/test-dom.ts";

Deno.test("applyFontSize writes the preset to data-font-size", () => {
  const dom = setupDom();
  applyFontSize("large");
  assertEquals(dom.document.documentElement.dataset.fontSize, "large");
});

Deno.test("applyFontSize falls back to standard for an invalid value", () => {
  const dom = setupDom();
  applyFontSize("huge" as FontSize);
  assertEquals(dom.document.documentElement.dataset.fontSize, "standard");
});

Deno.test("applyFontSize is idempotent", () => {
  const dom = setupDom();
  applyFontSize("small");
  applyFontSize("small");
  assertEquals(dom.document.documentElement.dataset.fontSize, "small");
});
