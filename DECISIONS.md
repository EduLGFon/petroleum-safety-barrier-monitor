# Decisions

Append-only architecture decision records. Newest last.

## D01 - Feature-preserving database index pass (2026-10-08)

Context: massive query-optimization request. Previous draft proposed
limits that would remove current features (pageSize clamp 100000 to 100,
dropping history join from list/export, pg_trgm extension, unbounded-query
truncation). Owner instruction: drop anything that limits or removes any
current feature.

Decision: implement additive-only speedups first. No contract, cap,
throttle, or pacing-guard change.

- Added (all `if not exists`, plain btree, no new extension):
  `idx_barriers_typology`, `idx_barriers_owner`,
  `idx_history_date_id(date desc, id desc)`,
  `idx_alert_events_transition`, `idx_alert_events_barrier_created`,
  `idx_sync_state_scope_status(scope, status, finished_at desc)`,
  `idx_throttle_reset`.
- Kept: pageSize clamp `1..100000`, 5000-row export batches, 200000-row
  ceiling, 500-row seed batches, Fracttal 100-row pages with loud abort,
  throttle windows, adaptive rate bucket, overlap lock, dedup keys,
  `record_status_change()` as the only status write path, btree tag index
  with documented `%q%` seq-scan (pg_trgm stays out per docs/DATABASE.md).
- Dropped from plan: pg_trgm GIN indexes, history-join removal, OFFSET to
  keyset without full sort-key coverage, any LIMIT that silently drops rows,
  any public caching of private rows.

Consequences: read filters/sorts and poll-lock/alert scans use indexes;
write path, API shapes, and caps unchanged. Follow-ups must stay additive
(COUNT OVER, single-query KPI with identical numbers, batched writes
through `record_status_change()` semantics, per-chunk transactions) with
docs updated in the same commit.

Verification: `deno task check` (includes migration-order guard).

## D02 - Read round-trip collapse (2026-10-08)

Context: dashboard fan-out runs list+count (2 scans), KPI (5-6 scans),
chart, vocabularies on every poll. No contract change allowed.

Decision: `listBarriers` carries the total as `count(*) OVER()` on each
row (one scan; out-of-range empty pages take one count query so
totalPages stays exact). `getKpi` runs the fixed-field aggregate plus one
tagged `UNION ALL` bucket query (2 round-trips, 3 with admin scopeCounts)
with the same filter subset and fail-closed NC definition per branch.
Wire shapes, pageSize clamp, and scope gating unchanged.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).

## D03 - Atomic chunked sync apply with batched audit (2026-10-08)

Context: `applyPlan` ran N barriers x 2-3 sequential statements in
autocommit, so a crash left half-applied runs and every audit row cost a
round-trip. Bulk `UNNEST` rewrites were rejected: they would bypass the
sanctioned `record_status_change()` path semantics and cannot be verified
without a live Postgres here.

Decision: new `withTx` helper in `lib/server/db.ts` (single-connection
BEGIN/COMMIT/ROLLBACK, guarded release, no stale retry since replaying a
partial tx is unsafe). `applyPlan` commits in `SYNC_APPLY_CHUNK=200`
transactions with identical per-row SQL (same UPDATE text, same
`record_status_change()` calls, same UNIQUE-conflict skip counting).
Audit rows collect per chunk and insert in one multi-row statement after
commit (best-effort preserved: empty/null skips, warn on missing table,
per-row `recordBarrierChange` fallback so one bad row never drops the
rest). Barrier-write failure still fails the run; audit failure never
fails barrier writes.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).

## D04 - Sync-changes list round-trip collapse (2026-10-08)

Context: `listSyncChanges` ran a standalone count plus the page query
sequentially (2 round-trips per header-page interaction).

Decision: same `count(*) OVER()` treatment as D02. The page-to-barrier
joins are all to-one, so the window total matches the old count exactly;
out-of-range empty pages take the old count query so totalPages stays
exact. Summary path (`summarizeAuditRows`) untouched: its three
aggregations use different joins over a small per-run table and are
already parallel, so a rewrite has no concrete benefit.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).
