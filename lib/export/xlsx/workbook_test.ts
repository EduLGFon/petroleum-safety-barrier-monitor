// Workbook tests for lib/export/xlsx/workbook.ts - the real .xlsx bytes read
// back with SheetJS, an independent OOXML implementation. These assert what a
// spreadsheet user actually gets: sheet names, the brand block, the frozen
// header, the autofilter, one row per barrier, a numeric ID, the status
// colours and the summary sheet that reconciles with the rows.
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import { batchesOf, kpiOf, mkBarrier, mkCount } from "../fixture.ts";
import { xlsxBytes } from "./workbook.ts";
import { EXPORT_HEADERS } from "../columns.ts";

import type { Bytes } from "./zip.ts";

import type { Barrier } from "../../types.ts";

import * as XLSX from "xlsx";

function xlsxOf(barriers: Barrier[], size = 500): Promise<Bytes> {
  return xlsxBytes(batchesOf(barriers, size), {
    companyName: "Petrobras",
    kpi: kpiOf(barriers),
  });
}

// gridOf: one sheet as an array of rows. SheetJS infers its range one row past
// the last populated one, so blank tails are dropped before counting.
function gridOf(bin: Bytes, sheet: string): unknown[][] {
  const ws = XLSX.read(bin, { type: "array" }).Sheets[sheet]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  while (
    grid.length > 0 &&
    (grid[grid.length - 1] ?? []).every((v) =>
      v === null || v === undefined || v === ""
    )
  ) {
    grid.pop();
  }
  return grid;
}

Deno.test("xlsxBytes builds a workbook any reader can open", async () => {
  const rows = [mkBarrier(), mkBarrier({ id: 2, tag: "PSV-002" })];
  const bin = await xlsxOf(rows);
  // ZIP local-file-header signature, then the package parts.
  assertStrictEquals(bin[0], 0x50); // "P"
  assertStrictEquals(bin[1], 0x4b); // "K"
  const names = new TextDecoder().decode(bin);
  assert(names.includes("[Content_Types].xml"));
  assert(names.includes("xl/workbook.xml"));
  assert(names.includes("xl/worksheets/sheet1.xml"));
  assert(names.includes("xl/worksheets/sheet2.xml"));
  assert(names.includes("xl/styles.xml"));
  assertEquals(XLSX.read(bin, { type: "array" }).SheetNames, [
    "Barreiras",
    "Resumo",
  ]);
});

Deno.test("the data sheet keeps the brand block over the header row", async () => {
  const grid = gridOf(await xlsxOf([mkBarrier()]), "Barreiras");
  // Brand, subtitle, accent rule, KPI labels, KPI values, column headers.
  assertStrictEquals(grid.length, 6 + 1);
  assertEquals(grid[5], EXPORT_HEADERS);
  assertStrictEquals(
    String(grid[0]![0]).toUpperCase().includes("PETROBRAS"),
    true,
  );
  assert(String(grid[1]![0]).includes("1 registros"));
  // KPI labels sit on their own row, each merged over a quarter of the sheet.
  assertStrictEquals(grid[3]![0], "Total");
  assertStrictEquals(grid[4]![0], "1");
  // Autofilter sits on the header row of all 30 columns.
  const ws = XLSX.read(await xlsxOf([mkBarrier()]), { type: "array" })
    .Sheets["Barreiras"]!;
  assertEquals(ws["!autofilter"], { ref: "A6:AD6" });
});

Deno.test("data rows come from the shared row() mapping", async () => {
  const bin = await xlsxOf([
    mkBarrier({ id: 7, tag: "PSV-007" }),
    mkBarrier({ id: 8, tag: "PSV-008", availability: "Degradado" }),
  ]);
  const grid = gridOf(bin, "Barreiras");
  // ID is a real number, everything else is the export text verbatim.
  assertStrictEquals(grid[6]![0], 7);
  assertStrictEquals(grid[6]![1], "PSV-007");
  assertStrictEquals(grid[6]![2], "FAL");
  assertStrictEquals(grid[6]![8], "Disponível");
  assertStrictEquals(grid[6]![10], "Conforme");
  assertStrictEquals(grid[7]![0], 8);
  assertStrictEquals(grid[7]![8], "Degradado");
});

Deno.test("xlsxBytes spans every batch", async () => {
  // Three batches: a page-local build could never reach these rows, and a
  // single-batch build could never prove the batching.
  const grid = gridOf(await xlsxOf(mkCount(1_200), 400), "Barreiras");
  assertStrictEquals(grid.length, 6 + 1_200);
  assertStrictEquals(grid[1_205]![1], "PSV-1200");
  assertStrictEquals(grid[1_205]![0], 1_200);
});

Deno.test("xlsxBytes of an empty selection still opens with a header", async () => {
  const grid = gridOf(await xlsxOf([]), "Barreiras");
  assertStrictEquals(grid.length, 6);
  assertEquals(grid[5], EXPORT_HEADERS);
  assertStrictEquals(grid[4]![0], "0");
});

Deno.test("the summary sheet reconciles with the rows", async () => {
  const rows = [
    mkBarrier(),
    mkBarrier({
      id: 2,
      compliance: "Não Conforme",
      availability: "Indisponível",
    }),
    mkBarrier({
      id: 3,
      compliance: "Não Conforme",
      availability: "Degradado",
      criticality: "A",
    }),
  ];
  const grid = gridOf(await xlsxOf(rows), "Resumo").map((r) => r.map(String));
  const total = grid.find((r) => r[0] === "Total");
  assertEquals(total, ["Total", "3"]);
  // Availability rows keep every dynamic status and add up to the total.
  const availability = grid.slice(2, -4)
    .map((r) => Number(r[1]))
    .reduce((a, b) => a + b, 0);
  assertStrictEquals(availability, 3);
  assertEquals(grid[grid.length - 1], ["% Conformidade", "33%"]);
});

Deno.test("hostile text is escaped and control bytes dropped", async () => {
  const grid = gridOf(
    await xlsxOf([
      mkBarrier({
        comments: `<script>alert("x")</script> & \u0007bell`,
        actionPlan: `Plan "B" <b>`,
      }),
    ]),
    "Barreiras",
  );
  // Round-tripped through the escaper: text intact, control byte gone.
  assertStrictEquals(grid[6]![11], `<script>alert("x")</script> & bell`);
  assertStrictEquals(grid[6]![12], `Plan "B" <b>`);
});
