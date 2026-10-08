// Unit tests for the PDF column geometry - the widths are what keep every
// export column on the A4-landscape page, so they are asserted, not eyeballed.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { EXPORT_HEADERS } from "../columns.ts";

import { colGeometry } from "./columns.ts";

import { wrapText } from "./metrics.ts";

Deno.test("colGeometry covers the page exactly, once per export column", () => {
  const cols = colGeometry(785.3);
  assertStrictEquals(cols.length, EXPORT_HEADERS.length);
  // Fixed layout with these widths can never overflow the printable area, so
  // no column is clipped at the paper edge.
  const sum = cols.reduce((a, c) => a + c.w, 0);
  assert(Math.abs(sum - 785.3) < 1e-6, String(sum));
  assert(cols.every((c) => c.w > 0));
  // Columns tile left to right with no gaps or overlaps.
  for (let i = 1; i < cols.length; i++) {
    assert(Math.abs(cols[i]!.x - (cols[i - 1]!.x + cols[i - 1]!.w)) < 1e-6);
  }
  // Free text gets more room than short codes.
  const byHeader = new Map(EXPORT_HEADERS.map((h, i) => [h, cols[i]!.w]));
  assert(byHeader.get("Comentários")! > byHeader.get("ID")!);
  assert(byHeader.get("ID")! >= 20, "ID column too narrow to read");
});

Deno.test("typical codes stay whole on one line", () => {
  const cols = colGeometry(785.3);
  const widthOf = (h: string) => cols[EXPORT_HEADERS.indexOf(h)]!.w - 4;
  // Six-digit IDs and TAGs at body size must not split mid-code.
  assertEquals(wrapText("200000", "regular", 6, widthOf("ID")), ["200000"]);
  assertEquals(wrapText("PSV-001", "mono", 6, widthOf("TAG")), ["PSV-001"]);
  assertEquals(wrapText("1014224", "regular", 6, widthOf("Código Fracttal")), [
    "1014224",
  ]);
});

Deno.test("colGeometry survives a column the weights do not know", () => {
  const cols = colGeometry(600, ["ID", "TAG", "Coluna Nova"]);
  assertStrictEquals(cols.length, 3);
  const sum = cols.reduce((a, c) => a + c.w, 0);
  assert(Math.abs(sum - 600) < 1e-6);
  assert(cols.every((c) => c.w > 0));
  assertStrictEquals(colGeometry(600, []).length, 0);
});
