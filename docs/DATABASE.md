# Database - Barrier Monitor

No ORM. Pure SQL via `jsr:@db/postgres`, bound parameters only. `ORDER BY` only through the `SORTABLE` whitelist.

## Setup

```bash
createdb barreiras
cp .env.example .env
deno task db:migrate
deno task db:seed
```

Docker:

```bash
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d
```

`db:migrate` and `db:seed` are idempotent. Reseed from scratch: `deno task db:seed -- --force`.

## Tables

Core: `locations`, `categories`, `criticality_levels`, `typologies`, `groupings`, `owners`, `loc_descs`, `availability_statuses`, `barriers`, `barrier_contingencies`, `barrier_status_history`, `users`, `sessions`, `auth_flows`, `access_groups`, `access_group_locations`, `user_access_groups`, `alert_rules`, `alert_events`, `alert_recipients`, `field_option_sets`, `sync_state`, `sync_barrier_changes`, `throttle_buckets`.

## Rules

- `barriers.external_code` is the upsert key for Fracttal sync.
- `deleted_at` marks soft-deleted rows.
- `compliance_id` is trigger-derived from `effective_availability_id()`, which applies the manual contingency overlay. Filters, KPI, chart and stale alerts all use the same function.
- `manual_fields` (text[]) lists barrier columns an admin took over in the
  editor; the Fracttal sync skips those columns and leaves them untouched
  until they are released back to the sync.
- Status changes use `record_status_change()` only; direct `availability_id`
  writes are rejected.
- Same-status calls do not create history.
- Sync runs are recorded in `sync_state`.
- Exports stream in 5,000-row batches with a 200,000-row ceiling.

## Verification

`deno task check` includes the migration-order guard. Schema changes must be re-runnable and update `docs/ARCHITECTURE.md` in the same commit.
