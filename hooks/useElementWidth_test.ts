// Hook test for hooks/useElementWidth.ts - the SSR/no-observer path.
// The interesting behaviour (ResizeObserver reporting a resized column) needs
// a real layout engine, so this covers what linkedom can: the hook starts on
// the fallback width, never publishes a zero width, and tears down cleanly.
import { assertStrictEquals } from "jsr:@std/assert@^1";

import { renderHook } from "../scripts/test-dom.ts";

import { useElementWidth } from "./useElementWidth.ts";

Deno.test("useElementWidth starts on the fallback width", async () => {
  const hh = await renderHook(useElementWidth);
  assertStrictEquals(hh.get().width, 640);
  hh.unmount();
});

Deno.test("useElementWidth honours a custom fallback and ignores a zero box", async () => {
  const hh = await renderHook(useElementWidth, { args: [320] });
  assertStrictEquals(hh.get().width, 320);
  // linkedom reports a zero-sized box, which must never become the width.
  hh.get().ref(null);
  await hh.rerender(320);
  assertStrictEquals(hh.get().width, 320);
  hh.unmount();
});
