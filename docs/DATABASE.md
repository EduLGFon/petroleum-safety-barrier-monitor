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

Core: `locations`, `categories`, `criticality_levels`, `typologies`, `groupings`, `owners`, `availabilities`, `compliances`, `barriers`, `barrier_contingencies`, `barrier_status_history`, `users`, `sessions`, `alert_rules`, `alert_events`, `alert_recipients`, `field_option_sets`, `sync_state`, `sync_barrier_changes`, `throttle_buckets`.

## Rules

- `barriers.external_code` is the upsert key for Fracttal sync.
- `deleted_at` marks soft-deleted rows.
- `compliance_id` is trigger-derived.
- Status changes use `record_status_change()` only; direct `availability_id` writes are rejected.
- Same-status calls do not create history.
- Sync runs are recorded in `sync_state`.
- Exports stream in 5,000-row batches with a 200,000-row ceiling.

## Verification

`deno task check` includes the migration-order guard. Schema changes must be re-runnable and update `docs/ARCHITECTURE.md` in the same commit.
