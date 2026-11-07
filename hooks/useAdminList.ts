// useAdminList - client-side search, paging, and selection for admin lists.
// Why it exists: the admin pages need the same 25/50/100 pager and selection
// pruning rules without duplicating state in every manager. The pure helpers
// are exported so their behaviour is testable without a DOM.
import { useEffect, useMemo, useState } from "preact/hooks";

import { PAGE_SIZE_OPTS } from "../lib/constants.ts";

export type AdminListKey = number | string;

export interface UseAdminListArgs<T, K extends AdminListKey> {
  items: T[];
  getId: (item: T) => K;
  getSearchText: (item: T) => string;
  initialPageSize?: number;
}

export interface AdminListState<T, K extends AdminListKey> {
  query: string;
  setQuery: (query: string) => void;
  filtered: T[];
  pageItems: T[];
  pageIds: K[];
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  total: number;
  totalPages: number;
  selectedIds: Set<K>;
  toggle: (id: K) => void;
  selectPage: () => void;
  selectAll: () => void;
  clearAll: () => void;
  allFilteredSelected: boolean;
  selectedCount: number;
}

// filterByQuery: case-insensitive substring search over the row's search text.
// An empty query returns the same array so callers can rely on reference
// equality while idle.
export function filterByQuery<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter((item) => getSearchText(item).toLowerCase().includes(q));
}

// pageSlice: 1-based page slice clamped to the last page. Empty lists yield
// an empty page instead of a phantom row.
export function pageSlice<T>(
  items: T[],
  page: number,
  pageSize: number,
): T[] {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (safePage - 1) * size;
  return items.slice(start, start + size);
}

// toggleKey: immutable Set toggle used by page and row checkboxes.
export function toggleKey<K extends AdminListKey>(
  keys: ReadonlySet<K>,
  id: K,
): Set<K> {
  const next = new Set(keys);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// pruneKeys: keeps only ids that still exist after a reload, so a deleted
// user never rides along in a later bulk action.
export function pruneKeys<K extends AdminListKey>(
  keys: ReadonlySet<K>,
  validIds: Iterable<K>,
): Set<K> {
  const valid = new Set(validIds);
  return new Set([...keys].filter((key) => valid.has(key)));
}

// allowedPageSize: PAGE_SIZE_OPTS stays 25/50/100 everywhere in the app.
function allowedPageSize(size: number | undefined): number {
  return PAGE_SIZE_OPTS.includes(size as 25 | 50 | 100)
    ? size as number
    : PAGE_SIZE_OPTS[0];
}

// useAdminList: owns search, paging, and selection for one admin resource.
export function useAdminList<T, K extends AdminListKey = AdminListKey>(
  { items, getId, getSearchText, initialPageSize }: UseAdminListArgs<T, K>,
): AdminListState<T, K> {
  const [query, setQueryState] = useState("");
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(() =>
    allowedPageSize(initialPageSize)
  );
  const [selectedIds, setSelectedIds] = useState<Set<K>>(() => new Set());

  const filtered = useMemo(
    () => filterByQuery(items, query, getSearchText),
    [items, query, getSearchText],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = useMemo(
    () => pageSlice(filtered, safePage, pageSize),
    [filtered, safePage, pageSize],
  );
  const pageIds = useMemo(
    () => pageItems.map(getId),
    [pageItems, getId],
  );

  // Search changes start a new scope: page one plus an empty selection.
  const setQuery = (next: string) => {
    setQueryState(next);
    setPageState(1);
    setSelectedIds(new Set());
  };

  const setPage = (next: number) => {
    const max = Math.max(1, Math.ceil(filtered.length / pageSize));
    setPageState(Math.min(Math.max(1, next), max));
  };

  const setPageSize = (next: number) => {
    setPageSizeState(allowedPageSize(next));
    setPageState(1);
  };

  // Clamp a stale page after a search or reload shrinks the result set.
  useEffect(() => {
    setPageState((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  // Prune selected ids that disappeared with a reload.
  useEffect(() => {
    const valid = new Set(items.map(getId));
    setSelectedIds((current) => {
      const next = pruneKeys(current, valid);
      return next.size === current.size ? current : next;
    });
  }, [items, getId]);

  const pageIdSet = useMemo(() => new Set(pageIds), [pageIds]);
  const allFilteredSelected = useMemo(
    () =>
      total > 0 &&
      selectedIds.size === total &&
      filtered.every((item) => selectedIds.has(getId(item))),
    [filtered, selectedIds, total, getId],
  );

  return {
    query,
    setQuery,
    filtered,
    pageItems,
    pageIds,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    selectedIds,
    toggle: (id: K) => setSelectedIds((current) => toggleKey(current, id)),
    selectPage: () => {
      if (pageIds.length === 0) return;
      setSelectedIds((current) => new Set([...current, ...pageIdSet]));
    },
    selectAll: () => {
      if (filtered.length === 0) return;
      setSelectedIds((current) =>
        new Set([...current, ...filtered.map(getId)])
      );
    },
    clearAll: () => setSelectedIds(new Set()),
    allFilteredSelected,
    selectedCount: selectedIds.size,
  };
}
