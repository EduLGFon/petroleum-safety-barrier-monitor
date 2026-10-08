// xlsx data sheet - the streamed "Barreiras" worksheet.
// Why it exists: the row block (brand, subtitle, KPI strip, header) plus one
// <row> per barrier, emitted while the database hands over batches. It also
// owns the per-cell styling decisions: TAG left in bold mono, short metadata
// (ID, codes, names, flags, ranks) centered, availability and compliance
// tinted by their status colour, criticality by its rank tier, the NC
// duration centered in italic orange, and zebra banding for scanning.
import {
  blankCell,
  cellRef,
  inlineStr,
  numberCell,
  rowXml,
  utf8,
  xmlDoc,
} from "./xml.ts";

import {
  argb,
  NS_MAIN,
  type StyleBook,
  type StyleSpec,
  tint,
} from "./styles.ts";

import { confColorFor, critColorFor, dispColorFor } from "../../constants.ts";

import { isCriticalRankLabel } from "../../enums/codes.ts";

import { EXPORT_HEADERS } from "../columns.ts";

import type { KpiStats } from "../summary.ts";

import type { Barrier } from "../../types.ts";

import type { Bytes } from "./zip.ts";

// Layout rows above the data: brand, subtitle, accent rule, KPI labels, KPI
// values, column headers. The frozen pane and the autofilter range hang off it.
export const HEADER_ROWS = 6;

// Brand palette, shared with the print report and the old spreadsheet.
const BRAND_BG = "FF0A1628";
const BRAND_TEXT = "FFFFFFFF";
const SUBTITLE_TEXT = "FF94A3B8";
const HEADER_BG = "FF1E3A5F";
const ACCENT = "FF3B82F6";
const ZEBRA_BG = "FFF8FAFC";
const CELL_TEXT = "FF1E293B";
const TAG_TEXT = "FF1D4ED8";
const DURATION_TEXT = "FFEA580C";
const MUTED_TEXT = "FF64748B";
const BORDER = "FFE2E8F0";

// Row geometry in points: keeps the brand block from looking cramped.
const BRAND_H = 26;
const RULE_H = 3;
const HEADER_H = 30;

export interface SheetStyles {
  brand: number;
  subtitle: number;
  rule: number;
  kpiLabel: number;
  kpiValue: (color: string) => number;
  header: number;
  cell: number;
  zebra: number;
  // Centered twins of the plain body cells, for short metadata columns.
  cellC: number;
  zebraC: number;
  id: number;
  zebraId: number;
  tag: number;
  zebraTag: number;
  critical: (label: string) => number;
  zebraCritical: (label: string) => number;
  availability: (label: string) => number;
  zebraAvailability: (label: string) => number;
  compliance: (label: string) => number;
  zebraCompliance: (label: string) => number;
  duration: number;
  zebraDuration: number;
}

// textStyle: a bordered 9pt cell, optionally banded and optionally aligned.
function textStyle(
  font: StyleSpec["font"],
  align: StyleSpec["align"],
  zebra: boolean,
): StyleSpec {
  return {
    font,
    align,
    border: BORDER,
    ...(zebra ? { fill: ZEBRA_BG } : {}),
  };
}

// tintedStyle: a status/rank cell - coloured label over a light blend of its
// colour, bold when the rank is a critical tier.
function tintedStyle(color: string, bold: boolean, zebra: boolean): StyleSpec {
  return {
    font: { size: 9, bold, color: argb(color) },
    fill: zebra ? ZEBRA_BG : tint(color),
    align: { horizontal: "center", vertical: "center", wrap: true },
    border: BORDER,
  };
}

// LEFT_HEADERS: the free-text columns that stay left-aligned for reading.
// Everything else holds short metadata (codes, names, flags, ranks, pills)
// and centers, so narrow columns read as tidy stacks instead of ragged rows.
// Keyed by header, like the wrap list in widths.ts, so inserting a column
// upstream cannot move the alignment onto the wrong field; an unknown header
// centers, which suits short metadata better than long prose.
const LEFT_HEADERS = new Set([
  "TAG",
  "Comentários",
  "Plano de Ação",
  "Local Instalação",
  "Desc. Contingência",
  "Desc. Degradação",
  "Comentários 2",
]);

// alignmentOf: "left" for the free-text columns, "center" for the rest.
export function alignmentOf(header: string): "left" | "center" {
  return LEFT_HEADERS.has(header) ? "left" : "center";
}

// sheetStyles: registers every style the data sheet needs. The per-value
// helpers register lazily, so a status or rank added after this deploy still
// gets its colour, and the registry dedupes repeats.
export function sheetStyles(book: StyleBook): SheetStyles {
  const wrap = { vertical: "top", wrap: true } as const;
  const center = { horizontal: "center", vertical: "top", wrap: true } as const;
  const plain = { size: 9, color: CELL_TEXT } as const;
  const cell = (zebra: boolean) => textStyle(plain, wrap, zebra);
  const cellC = (zebra: boolean) => textStyle(plain, center, zebra);
  const id = (zebra: boolean) =>
    textStyle({ size: 9, color: MUTED_TEXT }, center, zebra);
  const tag = (zebra: boolean) =>
    textStyle(
      { size: 8, bold: true, color: TAG_TEXT, mono: true },
      wrap,
      zebra,
    );
  const duration = (zebra: boolean) =>
    textStyle({ size: 9, italic: true, color: DURATION_TEXT }, center, zebra);
  return {
    brand: book.style({
      font: { size: 16, bold: true, color: BRAND_TEXT },
      fill: BRAND_BG,
      align: { vertical: "center" },
    }),
    subtitle: book.style({
      font: { size: 9, italic: true, color: SUBTITLE_TEXT },
      align: { vertical: "center" },
    }),
    rule: book.style({ fill: ACCENT }),
    kpiLabel: book.style({
      font: { size: 8, color: MUTED_TEXT },
      fill: ZEBRA_BG,
      align: { vertical: "center" },
    }),
    kpiValue: (color) =>
      book.style({
        font: { size: 13, bold: true, color: argb(color, "FF1E3A5F") },
        align: { vertical: "center" },
      }),
    header: book.style({
      font: { size: 9, bold: true, color: BRAND_TEXT },
      fill: HEADER_BG,
      align: { horizontal: "center", vertical: "center", wrap: true },
      border: BORDER,
    }),
    cell: book.style(cell(false)),
    zebra: book.style(cell(true)),
    cellC: book.style(cellC(false)),
    zebraC: book.style(cellC(true)),
    id: book.style(id(false)),
    zebraId: book.style(id(true)),
    tag: book.style(tag(false)),
    zebraTag: book.style(tag(true)),
    critical: (label) =>
      book.style(
        tintedStyle(
          critColorFor(label).solid,
          isCriticalRankLabel(label),
          false,
        ),
      ),
    zebraCritical: (label) =>
      book.style(
        tintedStyle(
          critColorFor(label).solid,
          isCriticalRankLabel(label),
          true,
        ),
      ),
    // Availability and compliance carry their own palettes (CONF keeps
    // Conforme/Não Conforme apart from the availability statuses).
    availability: (label) =>
      book.style(tintedStyle(dispColorFor(label).solid, true, false)),
    zebraAvailability: (label) =>
      book.style(tintedStyle(dispColorFor(label).solid, true, true)),
    compliance: (label) =>
      book.style(tintedStyle(confColorFor(label).solid, true, false)),
    zebraCompliance: (label) =>
      book.style(tintedStyle(confColorFor(label).solid, true, true)),
    duration: book.style(duration(false)),
    zebraDuration: book.style(duration(true)),
  };
}

// kpiSpans: splits the export columns into `blocks` merged ranges covering
// every column exactly, so the KPI strip stays aligned when the column list
// grows or a column is added.
export function kpiSpans(total: number, blocks: number): number[] {
  const base = Math.floor(total / blocks);
  const extra = total % blocks;
  return Array.from(
    { length: blocks },
    (_, i) => base + (i < extra ? 1 : 0),
  );
}

// band: one row of merged cells - the value in the first cell of each span,
// styled blanks for the rest so the fill covers the whole range.
function band(
  spans: number[],
  values: string[],
  styleFor: (i: number) => number,
  at: number,
  height?: number,
): string {
  let col = 1;
  const cells: string[] = [];
  spans.forEach((span, i) => {
    const style = styleFor(i);
    cells.push(inlineStr(cellRef(col, at), values[i] ?? "", style));
    for (let k = 1; k < span; k++) {
      cells.push(blankCell(cellRef(col + k, at), style));
    }
    col += span;
  });
  return rowXml(at, cells.join(""), height);
}

// rangeRef: "A1:AD1" for a run of columns on one row.
function rangeRef(
  spans: number[],
  at: number,
  from = 1,
): string[] {
  let col = from;
  return spans.map((span) => {
    const ref = `${cellRef(col, at)}:${cellRef(col + span - 1, at)}`;
    col += span;
    return ref;
  });
}

export interface SheetHeader {
  stats: KpiStats;
  subtitle: string;
  brand: string;
  headers: string[];
  widths: number[];
}

// sheetOpen: everything before the rows - the frozen view, the column widths
// and the opening <sheetData>.
export function sheetOpen(
  styles: SheetStyles,
  meta: SheetHeader,
): string {
  const last = meta.headers.length;
  const cols = meta.widths.map((w, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
  ).join("");
  return `${xmlDoc()}<worksheet xmlns="${NS_MAIN}">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="${HEADER_ROWS}" topLeftCell="A${HEADER_ROWS + 1}" ` +
    `activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${HEADER_ROWS + 1}" ` +
    `sqref="A${HEADER_ROWS + 1}"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="13"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>` +
    band([last], [meta.brand], () => styles.brand, 1, BRAND_H) +
    band([last], [meta.subtitle], () => styles.subtitle, 2) +
    band([last], [""], () => styles.rule, 3, RULE_H) +
    band(
      kpiSpans(last, 4),
      [
        "Total",
        `Conformes · ${meta.stats.pct}`,
        "Não conformes",
        "Críticas NC",
      ],
      () => styles.kpiLabel,
      4,
    ) +
    band(
      kpiSpans(last, 4),
      [
        meta.stats.total,
        meta.stats.compliant,
        meta.stats.nonCompliant,
        meta.stats.critical,
      ],
      (i) =>
        styles.kpiValue(
          ["FF1E3A5F", "FF15803D", "FFB91C1C", "FFC2410C"][i] ?? "FF1E3A5F",
        ),
      5,
    ) +
    rowXml(
      HEADER_ROWS,
      meta.headers.map((h, i) =>
        inlineStr(cellRef(i + 1, HEADER_ROWS), h, styles.header)
      ).join(""),
      HEADER_H,
    );
}

// sheetClose: ends sheetData, then the autofilter and the merged brand/KPI
// ranges. Element order is fixed by the schema - both come after sheetData,
// autofilter before mergeCells - and readers that validate (Excel, openpyxl)
// reject the file otherwise.
export function sheetClose(columns: number): string {
  const last = columns;
  const spans = kpiSpans(last, 4);
  const merges = [
    `A1:${cellRef(last, 1)}`,
    `A2:${cellRef(last, 2)}`,
    `A3:${cellRef(last, 3)}`,
    ...rangeRef(spans, 4),
    ...rangeRef(spans, 5),
  ];
  return `</sheetData>` +
    `<autoFilter ref="A${HEADER_ROWS}:${cellRef(last, HEADER_ROWS)}"/>` +
    `<mergeCells count="${merges.length}">${
      merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")
    }</mergeCells>` +
    `</worksheet>`;
}

// dataRow: one barrier as a worksheet row. `at` is the row number in the sheet
// and drives the zebra banding, so a streamed page boundary never breaks it.
export function dataRow(
  b: Barrier,
  cells: string[],
  at: number,
  zebra: boolean,
  styles: SheetStyles,
): string {
  const styleFor = (ci: number): number => {
    if (ci === 0) return zebra ? styles.zebraId : styles.id;
    if (ci === 1) return zebra ? styles.zebraTag : styles.tag;
    if (ci === 6) {
      return zebra
        ? styles.zebraCritical(b.criticality)
        : styles.critical(b.criticality);
    }
    if (ci === 8) {
      return zebra
        ? styles.zebraAvailability(b.availability)
        : styles.availability(b.availability);
    }
    if (ci === 10) {
      return zebra
        ? styles.zebraCompliance(b.compliance)
        : styles.compliance(b.compliance);
    }
    if (ci === 9 && cells[ci]) {
      return zebra ? styles.zebraDuration : styles.duration;
    }
    // Plain body text: centered for short metadata, left for free text.
    if (alignmentOf(EXPORT_HEADERS[ci] ?? "") === "center") {
      return zebra ? styles.zebraC : styles.cellC;
    }
    return zebra ? styles.zebra : styles.cell;
  };
  const parts = cells.map((v, ci) => {
    const ref = cellRef(ci + 1, at);
    // ID rides as a real number so Excel sorts and filters it numerically.
    if (ci === 0) {
      const n = Number(v);
      return Number.isFinite(n)
        ? numberCell(ref, n, styleFor(ci))
        : inlineStr(ref, v, styleFor(ci));
    }
    return inlineStr(ref, v, styleFor(ci));
  });
  return rowXml(at, parts.join(""));
}

// headerBytes: the fixed rows of the data sheet, encoded for the ZIP writer.
export function headerBytes(
  styles: SheetStyles,
  meta: SheetHeader,
): Bytes {
  return utf8(sheetOpen(styles, meta));
}
