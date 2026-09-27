// Unit tests for the shared export limits and the refusal wording.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import {
  EXPORT_MAX_ROWS,
  PDF_PART_ROWS,
  XLS_SHEET_ROWS,
} from "./limits.ts";

import { refusalMessage } from "./limits.ts";

Deno.test("refusalMessage names the ceiling and the real count", () => {
  const msg = refusalMessage("Exportação", EXPORT_MAX_ROWS + 1);
  assert(msg.startsWith("Exportação comporta até"));
  assert(msg.includes("Filtre mais ou exporte CSV"));
  assert(msg.includes("200.001"));
  assertStrictEquals(
    refusalMessage("Excel", 0).startsWith("Excel comporta até"),
    true,
  );
});

Deno.test("format ceilings stay inside what the formats accept", () => {
  // The whole point of the limits: the export ceiling is above the Excel
  // sheet ceiling (splittable) and a full export is splittable into print
  // parts, so nothing is silently cut.
  assert(EXPORT_MAX_ROWS > XLS_SHEET_ROWS);
  assert(EXPORT_MAX_ROWS > PDF_PART_ROWS);
  assertStrictEquals(EXPORT_MAX_ROWS % XLS_SHEET_ROWS !== 0, true);
});
