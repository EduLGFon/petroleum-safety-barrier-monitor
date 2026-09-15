// Live scope fetch assembly (Phase 2).
// This is why it exists: a correct sync needs complete item pages (a
// truncated page reads as mass deletion), bounded work pages for statuses,
// and one shared wiring so the CLI and the poll loop cannot drift apart.
// Both scripts call fetchScopeSignals, which paginates items to the
// envelope total, enforces assertCompletePage, and merges work events.
import {
  buildWorkEvents,
  resolverFor,
  type WorkEventsResolver,
} from "./work.ts";

import type { ItemTypeValue } from "./itemType.ts";

import type { FracttalClient } from "./client.ts";

import { assertCompletePage } from "./sync.ts";

export const SCOPE_PAGE_SIZE = 100;
export const WORK_PAGE_SIZE = 100;

export interface ScopeFetchOptions {
  locationCode: string;
  itemType: ItemTypeValue;
  maxPages: number;
  dateGte?: string;
}

export interface ScopeFetch {
  itemRows: unknown[];
  itemTotal: number;
  pagesFetched: number;
  workEvents: WorkEventsResolver;
  workOrders: number;
  workRequests: number;
  workMalformed: number;
}

// fetchScopeSignals: complete item pages for one station plus the bounded
// work-order status pass. Throws (fail-closed, zero writes downstream) on a
// truncated item page or any fetch failure. Work pages stay bounded to one
// recent page each: missing work only misses signals, never deletes, while
// a full work backfill is the import rebuild.
export async function fetchScopeSignals(
  client: Pick<
    FracttalClient,
    "listRawItems" | "listRawWorkOrders" | "listRawWorkRequests"
  >,
  opts: ScopeFetchOptions,
): Promise<ScopeFetch> {
  const maxPages = Math.max(1, Math.floor(opts.maxPages));
  const itemRows: unknown[] = [];
  let itemTotal = 0;
  let pagesFetched = 0;
  while (pagesFetched < maxPages) {
    const page = await client.listRawItems({
      locationCode: opts.locationCode,
      itemType: opts.itemType,
      start: pagesFetched * SCOPE_PAGE_SIZE,
      limit: SCOPE_PAGE_SIZE,
    });
    itemRows.push(...page.rows);
    itemTotal = Math.max(itemTotal, page.total);
    pagesFetched++;
    if (itemRows.length >= itemTotal) break;
  }
  assertCompletePage(itemRows, itemTotal, opts.locationCode);
  const [orderPage, requestPage] = await Promise.all([
    client.listRawWorkOrders({ limit: WORK_PAGE_SIZE, dateGte: opts.dateGte }),
    client.listRawWorkRequests({ limit: WORK_PAGE_SIZE }),
  ]);
  const built = buildWorkEvents(orderPage.rows, requestPage.rows);
  return {
    itemRows,
    itemTotal,
    pagesFetched,
    workEvents: resolverFor(built.events),
    workOrders: orderPage.rows.length,
    workRequests: requestPage.rows.length,
    workMalformed: built.malformed.length,
  };
}
