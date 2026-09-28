// Unit tests for the shared export limits and the refusal wording.
import { assert, assertStrictEquals } from "jsr:@std/assert@^1";

import { EXPORT_MAX_ROWS, PDF_PART_ROWS } from "./limits.ts";

import { normalizeFmt } from "./format.ts";

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
  // The whole point of the limits: the export ceiling sits under Excel's
  // 1,048,576-row worksheet limit (so one sheet always holds everything) and
  // a full export splits into print parts, so nothing is silently cut.
  assert(EXPORT_MAX_ROWS < 1_048_576);
  assert(EXPORT_MAX_ROWS > PDF_PART_ROWS);
  assertStrictEquals(EXPORT_MAX_ROWS % PDF_PART_ROWS, 0);
});

Deno.test("normalizeFmt accepts the current keys and the legacy xls one", () => {
  assertStrictEquals(normalizeFmt("csv"), "csv");
  assertStrictEquals(normalizeFmt("xlsx"), "xlsx");
  assertStrictEquals(normalizeFmt("pdf"), "pdf");
  // A tab opened before the .xlsx migration still sends the old key.
  assertStrictEquals(normalizeFmt("xls"), "xlsx");
  assertStrictEquals(normalizeFmt("xls "), "xlsx");
  assertStrictEquals(normalizeFmt("ods"), null);
  assertStrictEquals(normalizeFmt(undefined), null);
  assertStrictEquals(normalizeFmt(7), null);
});
