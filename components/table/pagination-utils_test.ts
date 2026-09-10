// Unit tests for components/table/pagination-utils.ts - page windows.
import { assertEquals } from "jsr:@std/assert";
import { buildPages } from "./pagination-utils.ts";

Deno.test("buildPages lists every page when few", () => {
  assertEquals(buildPages(1, 1), [1]);
  assertEquals(buildPages(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

Deno.test("buildPages windows around current with ellipsis", () => {
  assertEquals(buildPages(1, 20), [1, 2, "…", 20]);
  assertEquals(buildPages(10, 20), [1, "…", 9, 10, 11, "…", 20]);
  assertEquals(buildPages(20, 20), [1, "…", 19, 20]);
});
