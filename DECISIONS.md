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
