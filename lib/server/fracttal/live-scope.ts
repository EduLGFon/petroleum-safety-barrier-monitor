// Live scope fetch assembly (Phase 2 + all-station cycle).
// This is why it exists: a correct sync needs complete item pages (a
// truncated page reads as mass deletion), bounded work pages for statuses,
// and one shared wiring so the CLI, the poll cycle, and one-shot backfills
// cannot drift apart. Items sweep unfiltered (no server-side station filter
// exists: location_code values are group/asset tags); stations partition
// client-side in mapAsset, and deletion stays scoped to the stations the
// sweep resolves to. Work orders/requests are tenant-global, so the poll
// cycle fetches them once per cycle and shares the resolver across the run
// instead of refetching the same recent page per scope. Page requests run
// concurrently and reassemble in page order; throughput stays capped by the
// client's token bucket, so concurrency can never threaten the rate ceiling.
import {
  buildWorkEvents,
  resolverFor,
  type WorkEventsResolver,
} from "./work.ts";

import type { FracttalWorkQuery } from "./types.ts";

import type { ItemTypeValue } from "./itemType.ts";

import type { FracttalClient } from "./client.ts";

import { assertCompletePage } from "./sync.ts";

export const SCOPE_PAGE_SIZE = 100;
export const WORK_PAGE_SIZE = 100;

// DEFAULT_FETCH_CONCURRENCY bounds parallel page requests per fetch. Wall
// time drops toward (pages / concurrency) x latency; the token bucket keeps
// the aggregate under the ceiling regardless of this number.
export const DEFAULT_FETCH_CONCURRENCY = 4;

// DEFAULT_WORK_MAX_PAGES bounds the status pass to the newest N pages per
// work endpoint (500 rows each at N=5). The full history (120k+ orders) can
// never page per tick, so recency is the viable signal: asset flags and
// out-of-service dates (complete per scope) stay the primary derivation and
// the work pass catches recently opened corrective work. A wider window only
// widens recency; sticky open work older than the window still needs the
// import rebuild or a future open-status filter (see docs/FRACTTAL.md).
export const DEFAULT_WORK_MAX_PAGES = 5;

export interface ScopeFetchOptions {
  itemType: ItemTypeValue;
  maxPages: number;
  openStatuses?: readonly string[];
  openMaxPages?: number;
  workMaxPages?: number;
  concurrency?: number;
}

export interface ItemFetch {
  itemRows: unknown[];
  itemTotal: number;
  pagesFetched: number;
}

export interface WorkFetch {
  workEvents: WorkEventsResolver;
  workOrders: number;
  workRequests: number;
  workMalformed: number;
  // Truncation is split because the two halves mean different things:
  // ordersTruncated threatens completeness (a truncated open sweep misses
  // old open work exactly like the window does) and must warn loudly, while
  // requestsTruncated is the normal state (38k of history can never page
  // per cycle) and stays info-level. Neither aborts: missing work only
  // misses signals, never deletes.
  ordersTruncated: boolean;
  requestsTruncated: boolean;
}

export interface ScopeFetch extends ItemFetch, WorkFetch {
  pagesFetched: number;
}

// fetchPages: page 0 learns the envelope total, the rest fetch in concurrent
// batches and reassemble in page order (Promise.all preserves index order,
// so a slow page can never scramble rows). Batches stop at the pages the
// largest total seen requires - never past it - and late total growth is
// honored by recomputing that need each round, up to maxPages. Same
// fail-closed shape as the old sequential loop, with the per-page waits
// removed (the token bucket owns pacing now).
async function fetchPages(
  fetchPage: (start: number) => Promise<{ rows: unknown[]; total: number }>,
  opts: { maxPages: number; concurrency: number; pageSize: number },
): Promise<{ rows: unknown[]; total: number; pagesFetched: number }> {
  const maxPages = Math.max(1, Math.floor(opts.maxPages));
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  const first = await fetchPage(0);
  const merged: unknown[] = [...first.rows];
  let total = first.total;
  let pagesFetched = 1;
  while (merged.length < total && pagesFetched < maxPages) {
    const needed = Math.min(maxPages, Math.ceil(total / opts.pageSize));
    const starts: number[] = [];
    for (
      let p = pagesFetched;
      p < needed && starts.length < concurrency;
      p++
    ) {
      starts.push(p * opts.pageSize);
    }
    if (starts.length === 0) break;
    const batch = await Promise.all(starts.map((start) => fetchPage(start)));
    for (const page of batch) {
      merged.push(...page.rows);
      total = Math.max(total, page.total);
    }
    pagesFetched += batch.length;
  }
  return { rows: merged, total, pagesFetched };
}

// fetchItemSignals: complete equipment pages tenant-wide (unfiltered
// sweep). Server-side station scoping is not available - location_code
// values are group/asset tags, never station codes (verified live
// 2026-09-20: station codes 400, group codes match nothing useful) - so
// stations partition client-side in mapAsset instead. Throws (fail-closed,
// zero writes downstream) on a truncated page: a partial page would read as
// mass deletion in the reconcile plan.
export async function fetchItemSignals(
  client: Pick<FracttalClient, "listRawItems">,
  opts: {
    itemType: ItemTypeValue;
    maxPages: number;
    concurrency?: number;
  },
): Promise<ItemFetch> {
  const fetched = await fetchPages(
    (start) =>
      client.listRawItems({
        itemType: opts.itemType,
        start,
        limit: SCOPE_PAGE_SIZE,
      }),
    {
      maxPages: opts.maxPages,
      concurrency: opts.concurrency ?? DEFAULT_FETCH_CONCURRENCY,
      pageSize: SCOPE_PAGE_SIZE,
    },
  );
  assertCompletePage(fetched.rows, fetched.total, "all");
  return {
    itemRows: fetched.rows,
    itemTotal: fetched.total,
    pagesFetched: fetched.pagesFetched,
  };
}

// fetchWorkSignals: the newest workMaxPages per work endpoint, merged into
// per-code signals - or, with openStatuses set, one completed sweep per
// open ot_status instead of the newest window. The open sweep sees every
// open corrective WO every cycle regardless of age, so the stateless
// recompute stops missing work older than the window (completions and
// cancellations correctly vanish from it). Requests stay windowed in both
// modes (no open-only filter is documented for them). The endpoints page
// concurrently (bucket-capped). Truncation is split into orders/requests
// flags (see WorkFetch): missing work only misses signals, never deletes,
// so unlike items it must not abort the run. Any fetch ERROR still throws
// fail-closed (zero writes downstream) so statuses never decay on an outage.
export async function fetchWorkSignals(
  client: Pick<
    FracttalClient,
    "listRawWorkOrders" | "listRawWorkRequests"
  >,
  opts: {
    maxPages?: number;
    openStatuses?: readonly string[];
    openMaxPages?: number;
    concurrency?: number;
  } = {},
): Promise<WorkFetch> {
  const maxPages = Math.max(
    1,
    Math.floor(opts.maxPages ?? DEFAULT_WORK_MAX_PAGES),
  );
  // The open sweep pages each status to completion within its own cap
  // (default: the window cap). Completeness is the point of the mode: a
  // truncated open sweep misses old open work exactly like the window does,
  // so size the cap for the open backlog (ot_status=1 needed 38 pages at
  // ~3.7k open tasks), not for recency.
  const openCap = Math.max(1, Math.floor(opts.openMaxPages ?? maxPages));
  const concurrency = opts.concurrency ?? DEFAULT_FETCH_CONCURRENCY;
  const open = opts.openStatuses ?? [];
  const orderQueries: FracttalWorkQuery[] = open.length > 0
    ? open.map((otStatus) => ({ otStatus }))
    : [{}];
  const [orderPages, requestPages] = await Promise.all([
    Promise.all(
      orderQueries.map((base) =>
        fetchPages(
          (start) =>
            client.listRawWorkOrders({
              limit: WORK_PAGE_SIZE,
              start,
              ...base,
            }),
          {
            maxPages: open.length > 0 ? openCap : maxPages,
            concurrency,
            pageSize: WORK_PAGE_SIZE,
          },
        )
      ),
    ),
    fetchPages(
      (start) =>
        client.listRawWorkRequests({
          limit: WORK_PAGE_SIZE,
          start,
        }),
      { maxPages, concurrency, pageSize: WORK_PAGE_SIZE },
    ),
  ]);
  // ot_status values are mutually exclusive per row, so sweeps concatenate
  // without overlap; even a mis-filtered duplicate merges idempotently
  // downstream (mergeEvent keeps the earliest date).
  const orderRows = orderPages.flatMap((p) => p.rows);
  const built = buildWorkEvents(orderRows, requestPages.rows);
  return {
    workEvents: resolverFor(built.events),
    workOrders: orderRows.length,
    workRequests: requestPages.rows.length,
    workMalformed: built.malformed.length,
    ordersTruncated: orderPages.some((p) => p.rows.length < p.total),
    requestsTruncated: requestPages.rows.length < requestPages.total,
  };
}

// fetchScopeSignals: full equipment sweep plus the bounded work-order
// status pass. The poll cycle prefers fetchItemSignals + one shared
// fetchWorkSignals per cycle; this composition stays for the CLI backfill
// and one-shot dry-runs.
export async function fetchScopeSignals(
  client: Pick<
    FracttalClient,
    "listRawItems" | "listRawWorkOrders" | "listRawWorkRequests"
  >,
  opts: ScopeFetchOptions,
): Promise<ScopeFetch> {
  const items = await fetchItemSignals(client, opts);
  const work = await fetchWorkSignals(client, {
    maxPages: opts.workMaxPages,
    openStatuses: opts.openStatuses,
    openMaxPages: opts.openMaxPages,
    concurrency: opts.concurrency,
  });
  return {
    itemRows: items.itemRows,
    itemTotal: items.itemTotal,
    pagesFetched: items.pagesFetched,
    workEvents: work.workEvents,
    workOrders: work.workOrders,
    workRequests: work.workRequests,
    workMalformed: work.workMalformed,
    ordersTruncated: work.ordersTruncated,
    requestsTruncated: work.requestsTruncated,
  };
}
