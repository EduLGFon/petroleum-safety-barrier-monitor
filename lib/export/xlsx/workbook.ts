// xlsx workbook assembly - the .xlsx file as a stream of ZIP entries.
// Why it exists: one builder serves both callers, the browser download and
// the server route, so both files agree cell for cell. Rows arrive as database
// batches: the first batch sizes the columns, every batch appends worksheet
// rows, and styles.xml is written last because the style registry only knows
// the full set once the last row is in.
import {
  dataRow,
  HEADER_ROWS,
  headerBytes,
  sheetClose,
  sheetStyles,
} from "./dataSheet.ts";
import { EXPORT_HEADERS } from "../columns.ts";
import { type Bytes, bytesOf, writeZip, type ZipEntry } from "./zip.ts";
import { kpiStatsFrom, summaryRowsFrom } from "../summary.ts";
import { row } from "../rows.ts";
import { styleBook } from "./styles.ts";
import {
  appProps,
  contentTypes,
  coreProps,
  rootRels,
  summarySheet,
  workbook,
  workbookRels,
} from "./parts.ts";
import { withBrand } from "../../company.ts";
import { WIDTH_SAMPLE_ROWS, xlsxColWidths } from "./widths.ts";

import type { KpiSnapshot } from "../../types.ts";

import type { Barrier } from "../../types.ts";

import { ts } from "../html.ts";
import { utf8 } from "./xml.ts";

export interface XlsxMeta {
  companyName: string;
  // Scope aggregate, so the KPI strip and the summary sheet reconcile with
  // the dashboard without buffering every row just to count them.
  kpi: KpiSnapshot;
}

// dataSheetChunks: the streamed worksheet part. The first batch is pulled
// here (streaming cannot wait for every row to size the columns), then every
// batch appends its rows.
async function* dataSheetChunks(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsxMeta,
  styles: ReturnType<typeof sheetStyles>,
  widths: number[],
): AsyncGenerator<Bytes> {
  const stats = kpiStatsFrom(meta.kpi);
  const last = EXPORT_HEADERS.length;
  const header = {
    stats,
    subtitle: `Exportado em ${ts()}  |  ${stats.total} registros`,
    brand: withBrand(meta.companyName, "MONITOR DE BARREIRAS DE SEGURANÇA"),
    headers: EXPORT_HEADERS,
    widths,
  };
  yield headerBytes(styles, header);
  let at = HEADER_ROWS;
  for await (const batch of batches) {
    let out = "";
    for (const b of batch) {
      at++;
      out += dataRow(b, row(b), at, at % 2 === 0, styles);
    }
    // One chunk per batch keeps the memory ceiling at a batch of markup.
    yield utf8(out);
  }
  yield utf8(sheetClose(last));
}

// xlsxEntries: the ZIP entries in order. styles.xml and the summary sheet
// come after the data sheet, which is when the registry is complete.
async function* xlsxEntries(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsxMeta,
): AsyncGenerator<ZipEntry> {
  const book = styleBook();
  const styles = sheetStyles(book);
  const iterator = batches[Symbol.asyncIterator]();
  // First batch decides the column widths; it is replayed right after the
  // header block so no row is lost.
  const first = await iterator.next();
  const head: Barrier[] = first.done ? [] : first.value;
  const widths = xlsxColWidths(head.slice(0, WIDTH_SAMPLE_ROWS).map(row));
  const rest = (async function* (): AsyncGenerator<Barrier[]> {
    if (head.length > 0) yield head;
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      yield next.value;
    }
  })();
  const title = withBrand(
    meta.companyName,
    "Monitor de Barreiras de Segurança",
  );
  yield { name: "[Content_Types].xml", chunks: [utf8(contentTypes())] };
  yield { name: "_rels/.rels", chunks: [utf8(rootRels())] };
  yield {
    name: "docProps/core.xml",
    chunks: [utf8(coreProps(title, meta.companyName))],
  };
  yield { name: "docProps/app.xml", chunks: [utf8(appProps())] };
  yield { name: "xl/workbook.xml", chunks: [utf8(workbook())] };
  yield { name: "xl/_rels/workbook.xml.rels", chunks: [utf8(workbookRels())] };
  yield {
    name: "xl/worksheets/sheet1.xml",
    chunks: dataSheetChunks(rest, meta, styles, widths),
  };
  yield { name: "xl/styles.xml", chunks: [utf8(book.xml())] };
  yield {
    name: "xl/worksheets/sheet2.xml",
    chunks: [
      utf8(
        summarySheet(
          summaryRowsFrom(meta.kpi),
          styles.brand,
          styles.header,
          styles.kpiValue("FF1E3A5F"),
        ),
      ),
    ],
  };
}

// xlsxChunks: the finished .xlsx as a byte stream, row batches consumed as
// they are yielded. Nothing larger than one batch is ever held in memory.
export function xlsxChunks(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsxMeta,
): AsyncGenerator<Bytes> {
  return writeZip(xlsxEntries(batches, meta));
}

// xlsxBytes: the whole file in one array (browser download; the server
// streams xlsxChunks instead).
export function xlsxBytes(
  batches: AsyncIterable<Barrier[]>,
  meta: XlsxMeta,
): Promise<Bytes> {
  return bytesOf(xlsxChunks(batches, meta));
}
