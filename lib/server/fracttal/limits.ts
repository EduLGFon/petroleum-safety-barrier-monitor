// Shared Fracttal page and concurrency caps for sync and raw detail reads.
// This is why it exists: related read paths must respect the same upstream
// request size, concurrency, and bounded work-history window.
export const SCOPE_PAGE_SIZE = 100;
export const WORK_PAGE_SIZE = 100;
export const DEFAULT_FETCH_CONCURRENCY = 4;
export const DEFAULT_WORK_MAX_PAGES = 5;
