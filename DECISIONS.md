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

## D05 - Assessed and deferred (2026-10-08)

The following were investigated and deliberately NOT changed. Each needs
a live Postgres and/or running app to verify, and live runs need owner
authorization (agents.md section 12). Doing them blind would risk silent
behavior drift against the no-limits rule.

- `getSyncStatus` 4 parallel lookups: all are `LIMIT 1` index scans
  already parallel, so folding saves checkouts only. No concrete benefit.
- `summarizeAuditRows` 3 parallel aggs: different joins per aggregation
  over a small per-run table. Same verdict as above.
- `getVocabularies` / `getResolverLabels` caching: per-request data
  behind auth and admin rowScope gating. A shared cache needs an ADR
  proving no cross-session leak plus live poll verification.
- `loadLocal` OR-split: measured on the docker DB (18k barriers):
  PK scan plus filter in 6.6ms once per cycle. Technically index-defeating,
  practically negligible next to minutes of upstream fetch. Left as-is;
  a single query also avoids an N+1 worse than the filter.
- Alert `countRuleEvents` batching: dry-run `alerts-check` on the docker
  DB detects 39 candidates in seconds with no writes. No concrete benefit
  at current rule/candidate volume; revisit if rules multiply.
- `ensureCatalog` sequence use, `authors` identity change: sync write-path
  changes with no measured pain (catalog inserts are chunked and
  idempotent; author creates are rare admin actions). Left as-is.
- Upstream fetch-concurrency tuning: needs live rate-limit observation
  across full sweeps; the adaptive bucket already governs the ceiling.
- HTTP `ETag` (server emission): DONE, see D08. Aggregate dashboard
  endpoint and client 304 handling remain: new contract surface, needs
  browser-verified poll behavior.
- Export OFFSET to keyset: DONE, see D07 (65s tag-sorted export at 13k
  rows was the concrete trigger).
- `EXPLAIN (ANALYZE, BUFFERS)` baseline and load test: not run. No
  database is reachable in this session and `.env` secrets are
  off-limits. Run on staging before and after: list, KPI, export,
  and one `--apply` sync drill.

## D06 - Sync-status timestamp contract fix (2026-10-08)

Context: the DB integration suite finally ran against a populated
database (docker `db` service, one-shot tools container with the working
tree bind-mounted since `*.test.ts` never ships in the image). It exposed
a pre-existing failure no empty DB could show:
`sync-status_test.ts:114` expects `lastRun.finishedAt` to be a string,
but the driver returns `timestamptz` as a `Date`.

Decision: normalize to ISO strings in `getSyncStatus` (new `asIsoString`
helper). The `SyncStatus` contract already declares strings, and wire
JSON serializes `Date` to the same ISO form, so bytes on the wire are
unchanged; only the in-process shape now matches the type. Untouched:
`getLatestFinishedRun` / `getSyncRuns` carry the same driver-level lie
but are wire-serialized and covered by no failing test.

Verification: targeted DB suites plus full `deno task test` equivalent
in the tools container, 576 passed, 0 failed, against the docker DB.

## D07 - Keyset export paging (2026-10-08)

Context: measured a full-scope export walk on the docker DB (13k rows):
tag-ordered pages took ~22s each (65s total) from OFFSET rescans plus a
full sort per page; id order took 0.9s.

Decision: new `listBarrierWindowAfter` (keyset cursor: sort value plus
`b.id` tiebreaker) with row predicates that keep the exact ORDER BY
semantics of the OFFSET walk, including NULL placement for the only
nullable sort column (`owner`: ASC NULLS LAST, DESC NULLS FIRST).
`exportBatches` full walks page by cursor; offset windows keep the stable
OFFSET walk so print slices stay addressable. `listBarrierWindow` kept
for those callers. A first version missed the DESC NULL-to-value
crossing and an unused bind param; both were caught before commit (the
former by the new test, the latter by Postgres param typing).

Verification: temporary walk-equality script over all 10 sortable
columns x both directions x unknown-column fallback on 13k live rows:
identical sequences, tag pages ~70-250ms (65s to under 2s total).
Permanent `export_window_test.ts` (12 KST rows incl. null owners,
limit 5, all sorts) passes against the docker DB. Full suite: 577
passed, 0 failed.

## D08 - Conditional GETs with body-hash ETags (2026-10-08)

Context: dashboard polls re-download unchanged JSON on every tick
(sync-status every 60s/15s, barriers/KPI/chart/vocabularies every
5 minutes). No cache headers existed, so even the browser HTTP cache
could not help.

Decision: `okWithEtag(req, data, requestId)` in `lib/server/errors.ts`
(SHA-256 over the exact response bytes, `Cache-Control: private,
no-cache`, `304` with no body on matching `If-None-Match`), used by all
17 GET JSON handlers. Write responses, the export streams, and the
time-varying `/api/health` liveness probe are untouched. `private`
keeps authenticated bodies out of shared caches; per-request server
validation keeps role-gated data correct, so no feature is limited or
removed and callers that never send the header see byte-identical
responses. Client `If-None-Match` sending plus 304 handling in
`lib/api/http.ts` is the follow-up that turns the headers into saved
bytes. Update: client half DONE in the same release line - `fetchJson`
revalidates per URL from a bounded (50 entries) per-adapter memory
cache and serves 304s from memory; caches never cross adapters.

Verification: new `errors_test.ts` cases (stable tag, exact/weak/list/
wildcard match, foreign tag, changed bytes), new `http_test.ts` cases
(revalidate-then-304, tag-change refresh), `deno task check`, full
`deno task test` on host and against the docker DB. Live HTTP 304 round
trips were not exercised end to end (no valid credential available
without touching secrets); the deployed dashboard exercises them on
the next deploy.

## D09 - Duplication-guard hardening (2026-10-08)

Context: review of the dedup design found six residual paths where
duplicates or inconsistency could still slip in: retried same-status
PATCHes appended duplicate history rows, the single-write-path rule was
convention only, sync audit retries could double-insert, catalog/author
`max(id)+1` allocation raced, the running-lease claim raced under READ
COMMITTED, and nullable `external_code` rows would be invisible to
reconcile.

Decision: close all six with DB enforcement first, app guards second.

- Same-status `transitionBarrierStatus()` returns the current row with
  no write; `PATCH /api/barriers/:id/status` early-returns before the
  alert fan-out. The generic `PATCH /api/barriers/:id` already skipped
  unchanged statuses.
- `trg_guard_availability_write` rejects any direct `UPDATE OF
  availability_id` unless `record_status_change()` set
  `app.status_write` first (transaction-local GUC). INSERTs and sync
  field writes are unaffected.
- `uniq_sync_changes_run_barrier` plus `ON CONFLICT DO NOTHING` in
  `insertAuditBatch`/`recordBarrierChange` makes audit retries
  idempotent (best-effort-after-commit semantics kept per D03).
- `ensureCatalog` and `getOrCreateAuthor` serialize allocation with
  `pg_advisory_xact_lock` inside one transaction; UNIQUE label/code/
  name constraints stay the backstop.
- `uniq_sync_state_running_scope` partial unique index plus unique-
  violation mapping to `ScopeBusyError` makes the lease claim atomic.
- `barriers.external_code` is now `NOT NULL` (clean DBs via DDL,
  existing DBs via idempotent `ALTER ... SET NOT NULL`, fail-closed
  on legacy NULL rows).

Verification: new `dedup_test.ts` (pure `isUniqueViolation` cases) and
`dedup_integration_test.ts` (same-status no-op, guard rejection,
audit-once, lease-busy; self-skip without DATABASE_URL), `deno task
check`, full `deno task test` on host and against the migrated docker
DB. Docs updated in the same change (`docs/DATABASE.md`,
`docs/ARCHITECTURE.md`, `readme.md`).
