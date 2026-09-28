// Unit tests for the PDF pagination - page breaks are what keep every row
// whole and the header repeated, so they are asserted, not eyeballed.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
  CONTENT_BOTTOM,
  CONTENT_TOP,
  PagePlanner,
  rowHeight,
  tableCaps,
} from "./layout.ts";

Deno.test("rowHeight grows with wrapped lines", () => {
  assertStrictEquals(rowHeight(1), 6 * 1.15 + 3);
  assert(rowHeight(3) > rowHeight(1));
  assertStrictEquals(rowHeight(0), rowHeight(1));
});

Deno.test("tableCaps reserves the brand block on the first page", () => {
  const caps = tableCaps();
  assert(caps.firstCap < caps.restCap);
  assertStrictEquals(caps.restCap, CONTENT_BOTTOM - CONTENT_TOP);
  assert(caps.firstCap > 100, "first page must still fit several rows");
});

Deno.test("PagePlanner fills pages greedily and repeats the header room", () => {
  const planner = new PagePlanner(100, 200, 20);
  // Page-one rows cap at 80 (100 minus the 20 header): the third row
  // overflows and pushes the first two out as page one.
  const done = planner.push(30).length + planner.push(30).length +
    planner.push(30).length;
  assertStrictEquals(done, 1);
  const last = planner.flush();
  assertEquals(last, [[30]]);
});

Deno.test("PagePlanner never strands a row and never emits empties", () => {
  const planner = new PagePlanner(50, 50, 10);
  const pages: number[][] = [];
  for (const h of [20, 20, 20, 5]) pages.push(...planner.push(h));
  pages.push(...planner.flush());
  assertEquals(pages, [[20, 20], [20, 5]]);
  assertStrictEquals(planner.flush().length, 0);
});

Deno.test("PagePlanner isolates an over-tall row instead of stalling", () => {
  const planner = new PagePlanner(50, 50, 10);
  const pages: number[][] = [];
  pages.push(...planner.push(1000));
  // The lone giant waits (emitting nothing yet); the follower pushes it out
  // onto its own overflowing page.
  assertEquals(pages, []);
  pages.push(...planner.push(10));
  assertEquals(pages, [[1000]]);
  assertEquals(planner.flush(), [[10]]);
});
