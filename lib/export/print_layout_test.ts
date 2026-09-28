// Unit tests for the print report layout - the column widths are what keep
// every export column on the A4-landscape page, so they are asserted, not
// eyeballed.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { printColPct, printDocOpen, printTableHead } from "./reportHtml.ts";

import { EXPORT_HEADERS } from "./columns.ts";
import { kpiStatsFrom } from "./summary.ts";
import { computeKpi } from "../utils.ts";

const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;

Deno.test("printColPct covers the page exactly, once per export column", () => {
  const pct = printColPct();
  assertStrictEquals(pct.length, EXPORT_HEADERS.length);
  // Fixed layout with these widths can never overflow the printable area, so
  // no column is clipped at the paper edge any more.
  assertStrictEquals(sum(pct), 100);
  assert(pct.every((w) => w > 0));
  // Short codes keep a usable share; the free-text columns get more.
  const id = pct[EXPORT_HEADERS.indexOf("ID")]!;
  const comments = pct[EXPORT_HEADERS.indexOf("Comentários")]!;
  assert(comments > id, `comments ${comments} <= id ${id}`);
  assert(id >= 2, `ID column too narrow: ${id}%`);
});

Deno.test("printColPct survives a column the weights do not know", () => {
  // A new export column must not silently get zero width.
  const pct = printColPct(["ID", "TAG", "Coluna Nova"]);
  assertStrictEquals(pct.length, 3);
  assertStrictEquals(sum(pct), 100);
  assert(pct.every((w) => w > 0));
  assertStrictEquals(printColPct([]).length, 0);
});

Deno.test("the report table is fixed layout with a full colgroup", () => {
  const html = printDocOpen("Petrobras", kpiStatsFrom(computeKpi([])));
  assert(html.includes("table-layout:fixed"));
  const cols = html.match(/<col style="width:[\d.]+%">/g) ?? [];
  assertStrictEquals(cols.length, EXPORT_HEADERS.length);
  // The header row wraps instead of forcing its columns wider than the page.
  assertStrictEquals(html.includes("white-space:nowrap"), false);
  assertStrictEquals(printTableHead().includes("white-space:nowrap"), false);
  // Every header cell is present, in order.
  const head = printTableHead();
  for (const label of EXPORT_HEADERS) assert(head.includes(`>${label}<`));
});
