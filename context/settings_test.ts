// Provider tests for context/SettingsContext.tsx - setter composition and the
// restore-defaults action. They exist because two setters called in one tick
// used to build on the same render snapshot, so the second write silently
// dropped the first and "Restaurar padrões" only ever applied half of itself.
import {
  DEFAULTS,
  KEY,
  SettingsProvider,
  useSettings,
} from "./SettingsContext.tsx";

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { memoryStorage, setupDom } from "../scripts/test-dom.ts";

import type { SettingsState } from "./settings/presets.ts";

import { createElement as h } from "preact";

import { act } from "preact/test-utils";

import { render } from "preact";

type Ctx = ReturnType<typeof useSettings>;

// Mounts the provider with a probe that records the context of every render.
// Returns the storage plus a reader for the latest context, so a test can act
// on the live setters and re-render exactly like a real panel would.
async function mount(): Promise<{
  storage: Storage;
  latest: () => Ctx;
  rerender: () => Promise<void>;
}> {
  const dom = setupDom();
  const storage = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  const container = dom.document.createElement("div");
  const seen: Ctx[] = [];
  function Probe() {
    seen.push(useSettings());
    return h("span", null);
  }
  const tree = h(SettingsProvider, { children: h(Probe, {}) });
  await act(() => void render(tree, container));
  return {
    storage,
    latest: () => seen[seen.length - 1] as Ctx,
    rerender: () => act(() => void render(tree, container)),
  };
}

function stored(storage: Storage): SettingsState {
  return JSON.parse(storage.getItem(KEY) ?? "{}") as SettingsState;
}

Deno.test("setters called in the same tick both land", async () => {
  const { storage, latest, rerender } = await mount();
  const { setDefaults, setDefaultLoc } = latest();
  setDefaults({ category: "Válvula" });
  setDefaultLoc("FAL");
  await rerender();
  const s = latest().settings;
  assertEquals(s.defaultFilters, { category: "Válvula" });
  assertStrictEquals(s.defaultLocation, "FAL");
  // Same expectation on the persisted blob: the second write kept the first.
  assertEquals(stored(storage).defaultFilters, { category: "Válvula" });
  assertStrictEquals(stored(storage).defaultLocation, "FAL");
});

Deno.test("resetFilterDefaults clears filters and location on every click", async () => {
  const { storage, latest, rerender } = await mount();
  for (let click = 0; click < 3; click++) {
    latest().setDefaults({ category: `Cat ${click}`, sortDir: "desc" });
    latest().setDefaultLoc("FAL");
    await rerender();
    latest().resetFilterDefaults();
    await rerender();
    const s = latest().settings;
    assertEquals(s.defaultFilters, DEFAULTS.defaultFilters);
    assertStrictEquals(s.defaultLocation, DEFAULTS.defaultLocation);
    assertEquals(stored(storage).defaultFilters, {});
    assertStrictEquals(stored(storage).defaultLocation, "ALL");
  }
});

Deno.test("resetFilterDefaults keeps the appearance fields untouched", async () => {
  const { latest, rerender } = await mount();
  latest().setTheme("amoled");
  latest().setDensity("compact");
  await rerender();
  latest().setDefaults({ plan: "Sem plano" });
  await rerender();
  latest().resetFilterDefaults();
  await rerender();
  const s = latest().settings;
  assertStrictEquals(s.theme, "amoled");
  assertStrictEquals(s.density, "compact");
  assertEquals(s.defaultFilters, {});
});
