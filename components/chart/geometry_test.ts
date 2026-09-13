// Unit tests for components/chart/geometry.ts - scale math.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { buildTicks, scaleW } from "./geometry.ts";

Deno.test("buildTicks dedupes tiny maxima", () => {
  assertEquals(buildTicks(1), [0, 1]);
  assertEquals(buildTicks(0), [0]);
  assertEquals(buildTicks(100), [0, 50, 100]);
});

Deno.test("scaleW clamps negatives and scales linearly", () => {
  assertStrictEquals(scaleW(0, 10), 0);
  assertStrictEquals(scaleW(-5, 10), 0);
  assert(scaleW(5, 10) > 0 && scaleW(5, 10) < scaleW(10, 10));
});
