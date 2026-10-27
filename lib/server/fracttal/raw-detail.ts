// Raw Fracttal detail fetch - one asset plus bounded, code-scoped work rows.
// This is why it exists: developers can inspect upstream fields without
// persisting raw responses or widening the normal sync payload.
import {
  DEFAULT_FETCH_CONCURRENCY,
  DEFAULT_WORK_MAX_PAGES,
  WORK_PAGE_SIZE,
} from "./limits.ts";

import type { FracttalClient } from "./client.ts";

export interface RawRelatedRows {
  rows: unknown[];
  upstreamTotal: number;
  pagesFetched: number;
  excludedRows: number;
  truncated: boolean;
}

export interface RawBarrierDetail {
  asset: unknown;
  workOrders: RawRelatedRows;
  workRequests: RawRelatedRows;
}

type RawDetailClient = Pick<
  FracttalClient,
  "fetchRawItem" | "listRawWorkOrders" | "listRawWorkRequests"
>;

function rowMatchesCode(
  row: unknown,
  keys: readonly string[],
  code: string,
): boolean {
  if (typeof row !== "object" || row === null) return false;
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value !== "") return value === code;
  }
  return false;
}

async function collectRelatedRows(
  fetchPage: (
    start: number,
  ) => Promise<{ rows: unknown[]; total: number }>,
  keys: readonly string[],
  code: string,
): Promise<RawRelatedRows> {
  const first = await fetchPage(0);
  const pages = [first];
  const maxPages = Math.max(1, DEFAULT_WORK_MAX_PAGES);
  const pageCount = Math.min(
    maxPages,
    Math.max(1, Math.ceil(first.total / WORK_PAGE_SIZE)),
  );
  for (
    let firstPage = 1;
    firstPage < pageCount;
    firstPage += DEFAULT_FETCH_CONCURRENCY
  ) {
    const starts = Array.from(
      { length: Math.min(DEFAULT_FETCH_CONCURRENCY, pageCount - firstPage) },
      (_, index) => (firstPage + index) * WORK_PAGE_SIZE,
    );
    pages.push(...await Promise.all(starts.map(fetchPage)));
  }
  const allRows = pages.flatMap((page) => page.rows);
  const rows = allRows.filter((row) => rowMatchesCode(row, keys, code));
  const upstreamTotal = Math.max(...pages.map((page) => page.total));
  return {
    rows,
    upstreamTotal,
    pagesFetched: pages.length,
    excludedRows: allRows.length - rows.length,
    truncated: upstreamTotal > allRows.length,
  };
}

// fetchRawBarrierDetail: exact-code read only; the raw item and related row
// objects are not parsed or rewritten before returning to the caller.
export async function fetchRawBarrierDetail(
  client: RawDetailClient,
  code: string,
): Promise<RawBarrierDetail> {
  const asset = await client.fetchRawItem(code);
  const workOrders = await collectRelatedRows(
    (start) =>
      client.listRawWorkOrders({
        codeAsset: code,
        start,
        limit: WORK_PAGE_SIZE,
      }),
    ["code_asset", "code"],
    code,
  );
  const workRequests = await collectRelatedRows(
    (start) =>
      client.listRawWorkRequests({
        codeItem: code,
        start,
        limit: WORK_PAGE_SIZE,
      }),
    ["code_item"],
    code,
  );
  return { asset: asset.row, workOrders, workRequests };
}
