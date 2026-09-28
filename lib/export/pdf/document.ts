// PDF report document - the landscape report as real PDF bytes.
// Why it exists: the report must download as a file with no preview step
// (the print dialog froze the tab on large selections) and no page URL
// stamped on it. It assembles brand block, KPI chips, the 30-column table
// with a repeated header, and a footer on every page from the same row()
// mapping the other formats use, so all files agree cell for cell. Pages
// yield one at a time, so a huge selection streams instead of materializing.
import { colGeometry, type PdfColumn } from "./columns.ts";
import { alignmentOf } from "../xlsx/dataSheet.ts";
import {
  BRAND_H,
  CELL_PT,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_W,
  CONTENT_X,
  HEAD_LINE,
  HEAD_PT,
  LINE,
  PAD_X,
  PAD_Y,
  PAGE_H,
  PagePlanner,
  rowHeight,
  tableCaps,
} from "./layout.ts";
import { type PdfFontName, textWidth, wrapText } from "./metrics.ts";
import {
  ContentBuilder,
  hexToRgb,
  pdfChunks,
  type PdfColor,
  type PdfFontRef,
} from "./writer.ts";
import { tint } from "../xlsx/styles.ts";

import { confColorFor, critColorFor, dispColorFor } from "../../constants.ts";
import { isCriticalRankLabel } from "../../enums/codes.ts";
import { EXPORT_HEADERS } from "../columns.ts";
import { type KpiStats, kpiStatsFrom } from "../summary.ts";
import { row } from "../rows.ts";
import { ts } from "../html.ts";

import { batchesOf } from "../batches.ts";

import { computeKpi } from "../../utils.ts";

import type { Barrier, KpiSnapshot } from "../../types.ts";

import type { Bytes } from "./writer.ts";

// Brand palette, shared with the HTML report and the spreadsheet.
const BRAND_BG = "#0A1628";
const BRAND_TEXT = "#FFFFFF";
const SUBTITLE_TEXT = "#93C5FD";
const HEADER_BG = "#1E3A5F";
const ACCENT = "#3B82F6";
const ZEBRA_BG = "#F8FAFC";
const CELL_TEXT = "#1E293B";
const TAG_TEXT = "#1D4ED8";
const DURATION_TEXT = "#EA580C";
const MUTED_TEXT = "#64748B";
const FOOTER_TEXT = "#94A3B8";

// One prepared cell: wrapped lines plus the exact style each line draws in.
interface DrawCell {
  lines: string[];
  font: PdfFontName;
  ref: PdfFontRef;
  size: number;
  color: PdfColor;
  // Tinted backdrop behind the lines (status pills); absent means none.
  fill?: PdfColor;
  align: "left" | "center" | "right";
}

interface DrawRow {
  cells: DrawCell[];
  height: number;
  band: boolean;
}

const FONT_REF: Record<PdfFontName, PdfFontRef> = {
  regular: "F1",
  bold: "F2",
  italic: "F3",
  mono: "F4",
};

// pillCell: bold centered label over a tint of its colour (availability,
// compliance), wrapping inside the column like every other cell.
function pillCell(text: string, color: string, colW: number): DrawCell {
  return {
    lines: wrapText(text, "bold", CELL_PT, colW - PAD_X * 2),
    font: "bold",
    ref: FONT_REF.bold,
    size: CELL_PT,
    color: hexToRgb(color),
    fill: hexToRgb(tint(color)),
    align: "center",
  };
}

// textCell: plain wrapped text with the sheet's alignment rule.
function textCell(
  text: string,
  colW: number,
  header: string,
  over?: Partial<DrawCell>,
): DrawCell {
  return {
    lines: wrapText(text, over?.font ?? "regular", CELL_PT, colW - PAD_X * 2),
    font: "regular",
    ref: FONT_REF.regular,
    size: CELL_PT,
    color: hexToRgb(CELL_TEXT),
    align: alignmentOf(header),
    ...over,
  };
}

// barrierCells: one Barrier to 30 prepared cells. Column styling mirrors the
// spreadsheet: numeric ID, mono TAG, rank-tinted criticality, status pills,
// italic duration, free text left and short metadata centered.
function barrierCells(
  b: Barrier,
  cells: string[],
  cols: PdfColumn[],
): DrawCell[] {
  return cells.map((v, ci) => {
    const colW = cols[ci]?.w ?? 40;
    const header = EXPORT_HEADERS[ci] ?? "";
    if (ci === 0) {
      return textCell(v, colW, header, {
        color: hexToRgb(MUTED_TEXT),
        align: "center",
      });
    }
    if (ci === 1) {
      return textCell(v, colW, header, {
        font: "mono",
        ref: FONT_REF.mono,
        color: hexToRgb(TAG_TEXT),
      });
    }
    if (ci === 6) {
      const color = critColorFor(b.criticality).solid;
      // Critical tiers read bold, like the spreadsheet.
      const hot = isCriticalRankLabel(b.criticality);
      const font: PdfFontName = hot ? "bold" : "regular";
      return {
        lines: wrapText(v, font, CELL_PT, colW - PAD_X * 2),
        font,
        ref: FONT_REF[font],
        size: CELL_PT,
        color: hexToRgb(color),
        align: "center",
      };
    }
    if (ci === 8) return pillCell(v, dispColorFor(b.availability).solid, colW);
    if (ci === 10) return pillCell(v, confColorFor(b.compliance).solid, colW);
    if (ci === 9 && v) {
      return textCell(v, colW, header, {
        font: "italic",
        ref: FONT_REF.italic,
        color: hexToRgb(DURATION_TEXT),
        align: "center",
      });
    }
    if (ci === 9) return textCell("-", colW, header, { align: "center" });
    return textCell(v, colW, header);
  });
}

// headerCells: the repeated table header - bold white centered lines.
function headerCells(cols: PdfColumn[]): DrawCell[] {
  return EXPORT_HEADERS.map((h, ci) => {
    const colW = cols[ci]?.w ?? 40;
    return {
      lines: wrapText(h, "bold", HEAD_PT, colW - PAD_X * 2),
      font: "bold" as PdfFontName,
      ref: FONT_REF.bold,
      size: HEAD_PT,
      color: hexToRgb(BRAND_TEXT),
      align: "center" as const,
    };
  });
}

// headerHeight: the header row height from its tallest wrapped cell.
function headerHeight(cells: DrawCell[]): number {
  return rowHeight(Math.max(...cells.map((c) => c.lines.length)), HEAD_LINE);
}

export interface PdfReportMeta {
  companyName: string;
  // Scope aggregate, so the KPI strip matches the dashboard without
  // buffering every row just to count them.
  kpi: KpiSnapshot;
  // Suggested filename, also the document title.
  title: string;
  // IANA zone for the banner/footer stamps, passed straight to ts().
  timeZone?: string;
}

interface PageCtx {
  cb: ContentBuilder;
  stats: KpiStats;
  companyName: string;
  timeZone?: string;
  cols: PdfColumn[];
  header: DrawCell[];
  headerH: number;
  pageNum: number;
  first: boolean;
}

// drawTextLines: one wrapped cell, aligned inside its column.
function drawTextLines(
  cb: ContentBuilder,
  cell: DrawCell,
  x: number,
  yTop: number,
  w: number,
  lineH: number,
): void {
  cell.lines.forEach((line, i) => {
    const baseline = PAGE_H - (yTop + PAD_Y / 2 + cell.size * 0.8 + i * lineH);
    const lw = textWidth(line, cell.font, cell.size);
    const lx = cell.align === "center"
      ? x + (w - lw) / 2
      : cell.align === "right"
      ? x + w - PAD_X - lw
      : x + PAD_X;
    cb.text(line, lx, baseline, cell.ref, cell.size, cell.color);
  });
}

// drawRow: zebra band, pill backdrops, then every cell's lines.
function drawRow(
  cb: ContentBuilder,
  row: DrawRow,
  cols: PdfColumn[],
  yTop: number,
): void {
  const y = PAGE_H - yTop;
  if (row.band) {
    cb.filledRect(
      CONTENT_X,
      y - row.height,
      CONTENT_W,
      row.height,
      hexToRgb(ZEBRA_BG),
    );
  }
  row.cells.forEach((cell, ci) => {
    const col = cols[ci];
    if (!col) return;
    if (cell.fill) {
      // Pill backdrop vertically centered on the row.
      const rectH = cell.lines.length * LINE + PAD_Y;
      const top = yTop + (row.height - rectH) / 2;
      cb.filledRect(col.x, PAGE_H - top - rectH, col.w, rectH, cell.fill);
    }
    drawTextLines(cb, cell, col.x, yTop, col.w, LINE);
  });
}

// drawHeader: dark band plus centered header lines.
function drawHeader(ctx: PageCtx, yTop: number): void {
  const { cb, cols, header, headerH } = ctx;
  cb.filledRect(
    CONTENT_X,
    PAGE_H - yTop - headerH,
    CONTENT_W,
    headerH,
    hexToRgb(HEADER_BG),
  );
  header.forEach((cell, ci) => {
    const col = cols[ci];
    if (!col) return;
    drawTextLines(cb, cell, col.x, yTop, col.w, HEAD_LINE);
  });
}

// drawBrand: banner, accent rule and KPI chips; first page only.
function drawBrand(ctx: PageCtx): void {
  const { cb, stats, companyName, timeZone } = ctx;
  const bannerH = 46;
  cb.filledRect(
    CONTENT_X,
    PAGE_H - CONTENT_TOP - bannerH,
    CONTENT_W,
    bannerH,
    hexToRgb(BRAND_BG),
  );
  let y = CONTENT_TOP + 8;
  if (companyName) {
    cb.text(
      companyName.toUpperCase(),
      CONTENT_X + 8,
      PAGE_H - y - 6,
      "F2",
      8,
      hexToRgb(SUBTITLE_TEXT),
    );
    y += 10;
  }
  cb.text(
    "Monitor de Barreiras de Segurança",
    CONTENT_X + 8,
    PAGE_H - y - 11,
    "F2",
    14,
    hexToRgb(BRAND_TEXT),
  );
  y += 17;
  cb.text(
    `${ts(timeZone)}  |  ${stats.total} registros  ·  ${stats.pct} conformes`,
    CONTENT_X + 8,
    PAGE_H - y - 7,
    "F1",
    8.5,
    hexToRgb("#CBD5E1"),
  );
  y = CONTENT_TOP + bannerH;
  cb.filledRect(CONTENT_X, PAGE_H - y - 3, CONTENT_W, 3, hexToRgb(ACCENT));
  y += 3 + 5;
  // KPI chips: four equal boxes across the content width.
  const gap = 6;
  const chipW = (CONTENT_W - gap * 3) / 4;
  const chipH = 26;
  const chips: Array<[string, string, string]> = [
    ["Total", stats.total, "#1E3A5F"],
    [`Conformes · ${stats.pct}`, stats.compliant, "#15803D"],
    ["Não conformes", stats.nonCompliant, "#B91C1C"],
    ["Críticas NC", stats.critical, "#C2410C"],
  ];
  chips.forEach(([label, value, color], i) => {
    const x = CONTENT_X + i * (chipW + gap);
    cb.filledRect(x, PAGE_H - y - chipH, chipW, chipH, hexToRgb("#EFF6FF"));
    cb.text(
      label.toUpperCase(),
      x + 6,
      PAGE_H - y - 10,
      "F1",
      7,
      hexToRgb(MUTED_TEXT),
    );
    cb.text(value, x + 6, PAGE_H - y - 22, "F2", 12, hexToRgb(color));
  });
}

// drawFooter: page number left, generation stamp right, both inside the
// bottom margin. The total page count is unknowable in a single streaming
// pass, so the footer numbers pages without a total instead of buffering
// the file.
function drawFooter(ctx: PageCtx): void {
  const { cb, timeZone, pageNum } = ctx;
  const y = PAGE_H - CONTENT_BOTTOM - 10;
  cb.text(
    `Monitor de Barreiras · Página ${pageNum}`,
    CONTENT_X,
    y,
    "F1",
    7,
    hexToRgb(FOOTER_TEXT),
  );
  const stamp = `Gerado em ${ts(timeZone)}`;
  const w = textWidth(stamp, "regular", 7);
  cb.text(stamp, CONTENT_X + CONTENT_W - w, y, "F1", 7, hexToRgb(FOOTER_TEXT));
}

// drawPage: brand (first page only), header, rows, footer; returns the
// deflated-ready content bytes.
function drawPage(ctx: PageCtx, rows: DrawRow[]): Bytes {
  const { cb, headerH } = ctx;
  let yTop = CONTENT_TOP;
  if (ctx.first) {
    drawBrand(ctx);
    yTop += BRAND_H;
  }
  drawHeader(ctx, yTop);
  yTop += headerH;
  for (const row of rows) {
    drawRow(ctx.cb, row, ctx.cols, yTop);
    yTop += row.height;
  }
  drawFooter(ctx);
  return cb.bytes();
}

// pdfReportPages: layout consumes barrier batches and yields one page of
// content bytes at a time. Only the pending rows of an open page are ever
// held, never the whole export.
export async function* pdfReportPages(
  batches: AsyncIterable<Barrier[]>,
  meta: PdfReportMeta,
): AsyncGenerator<Bytes> {
  const cols = colGeometry(CONTENT_W);
  const stats = kpiStatsFrom(meta.kpi);
  const header = headerCells(cols);
  const headH = headerHeight(header);
  const caps = tableCaps();
  const planner = new PagePlanner(caps.firstCap, caps.restCap, headH);
  let pageNum = 0;
  let first = true;
  // Pending rows with their heights, sliced by the planner's counts.
  const pending: DrawRow[] = [];
  const emit = function* (counts: number[][]): Generator<Bytes> {
    for (const count of counts) {
      const rows = pending.splice(0, count.length);
      pageNum++;
      const ctx: PageCtx = {
        cb: new ContentBuilder(),
        stats,
        companyName: meta.companyName,
        timeZone: meta.timeZone,
        cols,
        header,
        headerH: headH,
        pageNum,
        first,
      };
      first = false;
      yield drawPage(ctx, rows);
    }
  };
  let at = 0;
  for await (const batch of batches) {
    for (const b of batch) {
      const cells = barrierCells(b, row(b), cols);
      const height = rowHeight(
        Math.max(...cells.map((c) => c.lines.length)),
      );
      pending.push({ cells, height, band: at % 2 === 0 });
      at++;
      yield* emit(planner.push(height));
    }
  }
  yield* emit(planner.flush());
  if (pageNum === 0) {
    // Empty scope still gets its brand, header and footer page.
    pageNum++;
    yield drawPage({
      cb: new ContentBuilder(),
      stats,
      companyName: meta.companyName,
      timeZone: meta.timeZone,
      cols,
      header,
      headerH: headH,
      pageNum,
      first: true,
    }, []);
  }
}

// buildPdfDocument: the whole selection as one PDF byte array (browser
// download; the server streams pdfReportPages instead).
export async function buildPdfDocument(
  barriers: Barrier[],
  meta: Omit<PdfReportMeta, "kpi"> & { kpi?: KpiSnapshot },
): Promise<Bytes> {
  const parts: Bytes[] = [];
  for await (
    const chunk of pdfChunks(
      pdfReportPages(batchesOf(barriers, 5_000), {
        ...meta,
        kpi: meta.kpi ?? computeKpi(barriers),
      }),
      {
        title: meta.title,
        author: meta.companyName || "Monitor de Barreiras de Segurança",
      },
    )
  ) {
    parts.push(chunk);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
