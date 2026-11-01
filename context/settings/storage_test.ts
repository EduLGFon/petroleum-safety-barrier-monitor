// Storage tests for context/settings/storage.ts - per-field validation.
// The font-size field is additive: a missing or tampered value must fall back
// to standard without resetting the rest of the saved appearance.
import { DEFAULTS, KEY } from "./presets.ts";
import { loadSettings } from "./storage.ts";

import { assertEquals } from "jsr:@std/assert@^1";

import { setupDom } from "../../scripts/test-dom.ts";

function load(raw?: string) {
  const dom = setupDom();
  if (raw !== undefined) dom.storage.setItem(KEY, raw);
  return loadSettings();
}

Deno.test("loadSettings defaults a missing fontSize to standard", () => {
  const s = load(JSON.stringify({ theme: "light", density: "compact" }));
  assertEquals(s.fontSize, "standard");
  assertEquals(s.theme, "light");
  assertEquals(s.density, "compact");
});

Deno.test("loadSettings preserves a valid fontSize", () => {
  for (const fontSize of ["small", "standard", "large", "xlarge"] as const) {
    const s = load(JSON.stringify({ fontSize }));
    assertEquals(s.fontSize, fontSize);
  }
});

Deno.test("loadSettings falls back from an unknown fontSize per field", () => {
  const s = load(
    JSON.stringify({
      fontSize: "huge",
      theme: "amoled",
      density: "spacious",
      defaultLocation: "FAL",
    }),
  );
  assertEquals(s.fontSize, "standard");
  assertEquals(s.theme, "amoled");
  assertEquals(s.density, "spacious");
  assertEquals(s.defaultLocation, "FAL");
});

Deno.test("loadSettings returns DEFAULTS for malformed JSON", () => {
  assertEquals(load("{"), DEFAULTS);
});
