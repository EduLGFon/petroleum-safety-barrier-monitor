// Tests for the pager's pure page-window math: the cur±1 window, the
// ellipsis placement and the edge behavior the Pagination component renders.
import { assertEquals } from "jsr:@std/assert@^1";

import { buildPages } from "./pagination-utils.ts";

Deno.test("buildPages lists every page when few", () => {
  assertEquals(buildPages(1, 1), [1]);
  assertEquals(buildPages(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

Deno.test("buildPages windows around current with ellipsis", () => {
  assertEquals(buildPages(10, 20), [1, "…", 9, 10, 11, "…", 20]);
});

Deno.test("buildPages keeps three pages at the edges before an ellipsis", () => {
  // Regression: page 1 of 8 used to render [1, 2, …, 8], skipping page 3
  // even though it borders the visible window. The edge sections now keep
  // three consecutive pages, symmetric on the last page.
  assertEquals(buildPages(1, 8), [1, 2, 3, "…", 8]);
  assertEquals(buildPages(1, 20), [1, 2, 3, "…", 20]);
  assertEquals(buildPages(20, 20), [1, "…", 18, 19, 20]);
  assertEquals(buildPages(8, 8), [1, "…", 6, 7, 8]);
});

Deno.test("buildPages renders the page behind a one-page ellipsis", () => {
  // An ellipsis that hides a single page is a dead cell: the hidden page
  // renders instead, same cell count, one more reachable page.
  assertEquals(buildPages(4, 20), [1, 2, 3, 4, 5, "…", 20]);
  assertEquals(buildPages(17, 20), [1, "…", 16, 17, 18, 19, 20]);
});

Deno.test("buildPages tolerates out-of-range current pages", () => {
  assertEquals(buildPages(0, 20), [1, 2, 3, "…", 20]);
  assertEquals(buildPages(25, 20), [1, "…", 18, 19, 20]);
});
