# Database

PostgreSQL, accessed through `jsr:@db/postgres` with pure SQL. There is no
ORM. Values are bound parameters; the only interpolated identifiers are
fixed whitelists such as `SORTABLE` for `ORDER BY`. The schema lives in
`db/schema.sql`; static lookup rows live in `db/seed_lookups.sql`.

The bundled compose stack uses `postgres:18-alpine`. The native Windows
deployment installs PostgreSQL 16 (see
[DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md)). Both versions are supported; the
schema avoids version-specific features and only uses an optional `pg_trgm`
index when the extension is available.

## Setup

```bash
createdb barreiras
cp .env.example .env
deno task db:migrate       # schema plus static lookups
deno task db:seed          # optional demo barriers and history
```

Docker:

```bash
docker compose up -d db
deno task docker:migrate
docker compose up -d
```

`db:migrate` requires `DATABASE_URL`. Back up before any production run:
`pg_dump -Fc "$DATABASE_URL" -f backup/pre-migrate-<timestamp>.dump`.

## Migrations

`deno task db:migrate` runs `scripts/migrate.ts`, which applies these files
in order:

1. `db/schema.sql`
2. `db/cleanup-unused-auth.sql`
3. `db/seed_lookups.sql`

Each file runs in its own transaction and is re-applied on every run. The
script creates `schema_migrations (filename primary key, applied_at)` and
upserts each successful filename; it is an audit/gate table, not one of the
25 domain tables below. There are no versioned migration files and no
per-file skip. A failure rolls back the current file and exits non-zero.
Statements must stay re-runnable: `create table if not exists`, `alter table
... add column if not exists`, `create or replace function`, drop-before-
recreate triggers and upserts by stable key.

`deno task check` runs `scripts/check-migration-order.ts`. It fails when an
index appears before the column it references, or when an `ALTER TABLE` or
`REFERENCES` uses a table created later. New schema changes must pass that
guard and update [ARCHITECTURE.md](ARCHITECTURE.md) in the same commit.

`deno task db:seed` is not idempotent. If `barriers` has rows it exits 1
unless `--force` is passed. A force reseed also requires `SEED_FORCE=1` and
an interactive typed `YES`; it truncates `barrier_status_history` and
`barriers` with `RESTART IDENTITY CASCADE`, then inserts demo catalog rows,
barriers and history in one transaction. Demo data is for local or
disposable databases only.

## Tables (25)

### Lookups

| Table                   | Purpose and key columns                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `locations`             | Stations. `id` PK, `code` unique, `type`, `name`. Dynamic vocabulary; `ALL` (0) is UI-only and never a row |
| `availability_statuses` | Availability contract. `id` PK, `label` unique, `is_compliant`; ids 0-5 match the frontend resolvers       |
| `criticality_levels`    | Criticality ranks. `id` PK, `label` unique; 0 ESO, 1 A, 2 B, 3 C, 4 D                                      |
| `categories`            | Barrier categories. `id` PK, `label` unique; dynamic vocabulary                                            |
| `groupings`             | Grouping labels. `id` PK, `label` unique; static id contract                                               |
| `typologies`            | Typology labels. `id` PK, `label` unique; static id contract                                               |
| `owners`                | Owner labels. `id` PK, `label` unique; a null `barriers.owner_id` means not informed                       |
| `loc_descs`             | Location-description labels. `id` PK, `label` unique; static id contract                                   |
| `authors`               | Status-history authors. `id` PK, `name` unique                                                             |

### Barriers and history

| Table                    | Purpose and key columns                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barriers`               | Main asset row. `id` PK; `tag`; FKs to `locations`, `typologies`, `loc_descs`, `criticality_levels`, `categories`, `groupings`, `owners` and `availability_statuses`; `owner_id` nullable; `compliance_id` derived 0/1; sheet text columns; `status_since`; `external_code` unique and not null; `source_updated_at`; `deleted_at`; `created_at`; `updated_at`; `is_active`; `manual_fields text[]`; `scope_source` |
| `barrier_contingencies`  | Local contingency links. PK `(barrier_id, contingency_barrier_id)`; both FKs cascade; `management_change`, `risk_analysis`; check rejects self-links; timestamps                                                                                                                                                                                                                                                    |
| `barrier_status_history` | One row per transition. `id` PK; `barrier_id` FK cascade; `date`; `status_id` FK; `author_id` FK; `note`; `sync_run_id` FK `sync_state` on delete set null; `source_author`; `participants jsonb`; `created_at`                                                                                                                                                                                                     |

### Sync audit

| Table                  | Purpose and key columns                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync_state`           | One row per sync run. `id` PK; `scope`; `status` running/ok/failed; `cursor`; inserts, updates, skips and deletes counts; `note`; `started_at`; `finished_at` doubles as the heartbeat. A partial unique index allows one `running` row per scope      |
| `sync_barrier_changes` | Per-barrier audit for a run. `id` PK; `run_id` FK cascade; `barrier_id` FK cascade; `kind` new/updated/restored/removed; old and new availability ids; `changed_fields jsonb`; old and new snapshot jsonb; `created_at`. Unique `(run_id, barrier_id)` |

### Alerts

| Table              | Purpose and key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alert_rules`      | Trigger configuration. `id` PK; `name` unique; optional `category_id` and `to_status_id`; `critical_only`; `include_recovery`; `stale_days`; `notify_immediate`; `active`; `description`; scope arrays `category_ids`, `from_status_ids`, `to_status_ids`, `location_ids`, `criticality_ids`, `typology_ids`, `grouping_ids`, `owner_ids`; `urgency`; `only_no_action_plan`; `on_transition`; `cooldown_minutes`; `max_per_day`; quiet hours; `active_days`; `priority`; `valid_from`/`valid_to`; `stale_repeat_days`; `last_triggered_at`; timestamps |
| `alert_events`     | Alert dedup and delivery state. `id` PK; `barrier_id` FK set null; `transition_date`; `status_id` FK; `kind`; `dedup_key` unique; `payload jsonb`; `sent_at` null while pending; `created_at`; `provider_correlation_id`; `provider_parcial`                                                                                                                                                                                                                                                                                                           |
| `alert_recipients` | Legacy manual recipient list. `id` PK; `email` unique; `name`; `phone`; `active`; `created_at`. Not read by alert delivery                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Auth and access

| Table                    | Purpose and key columns                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                  | Local and Entra accounts. `id` identity PK; `email` unique and lowercased; `name`; `phone`; nullable `password_hash`; `role` admin/user; `active`; `created_at`; `updated_at`; `auth_source` local/entra; `entra_tid`; `entra_oid`; `must_change_password`. Shape check keeps Entra rows passwordless and the tenant/object pair all-or-nothing; a partial unique index covers bound Entra identities |
| `sessions`               | Opaque login sessions. `id` PK; `user_id` FK cascade; `token_hash` unique; `expires_at`; `created_at`; `auth_method` password/entra; `idp_sid_hash` nullable and 64-hex when set                                                                                                                                                                                                                      |
| `auth_flows`             | One-time Entra OIDC flows. `state_hash` PK; `browser_hash`; `nonce`; `code_verifier`; `return_to`; `created_at`; `expires_at`; check constraints bound nonce, verifier and return path                                                                                                                                                                                                                |
| `access_groups`          | Station-scoped visibility groups. `id` PK; `name` unique; `description`; timestamps                                                                                                                                                                                                                                                                                                                   |
| `access_group_locations` | Group-to-station links. PK `(group_id, location_id)`; both FKs cascade                                                                                                                                                                                                                                                                                                                                |
| `user_access_groups`     | User-to-group links. PK `(user_id, group_id)`; both FKs cascade                                                                                                                                                                                                                                                                                                                                       |

### Operations

| Table               | Purpose and key columns                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `throttle_buckets`  | Shared fixed-window counters. PK `(bucket, key)`; `count`; `reset_at`. Used by the export budget, with in-memory throttles as fallback |
| `field_option_sets` | Curated answers for sheet questions. `field` PK; `options jsonb`; `updated_by`; `updated_at`. Missing fields are seeded on first read  |

There are no views, no PostgreSQL enum types and no Row-Level Security
policies. Access scoping is enforced by the application.

## Relationships and invariants

- `barriers` owns the asset row and references every lookup it displays.
  `external_code` is the stable upstream business key used for the Fracttal
  upsert; it is unique and not null. `deleted_at` marks a soft delete and
  `is_active` mirrors the upstream enable flag. Neither removes the row.
- `barriers.compliance_id` is derived, not a foreign key. The trigger
  recomputes it from the effective availability so filters, KPI, chart,
  stale alerts and the API agree. Values are 0 compliant and 1
  non-compliant.
- Status writes use `record_status_change()` only. It updates
  `availability_id` and `status_since`, appends the history row and sets a
  transaction-local `app.status_write` guard. `guard_availability_write()`
  rejects any direct update of `availability_id` without that guard. A
  same-status call creates no history and no alert.
- `barrier_status_history.sync_run_id` ties sync-authored transitions to
  `sync_state`; `sync_barrier_changes` holds the compact field diff and the
  before/after snapshots for a run.
- `alert_events.dedup_key` is unique per barrier, transition date and status,
  so a retried detector cannot double-send. `payload` carries renderer and
  rule context. `sent_at` is null until delivery succeeds.
- `sessions` cascade with the user. `auth_flows` are transient and expire.
  Entra sessions may carry an `idp_sid_hash`, which the front-channel logout
  route uses to revoke them.
- Access scope is a chain:
  `users -> user_access_groups -> access_groups -> access_group_locations ->
  locations`. Admins bypass it, a non-admin sees the union of their groups,
  and a non-admin with no group sees nothing. A direct SQL connection sees
  every row.

## Alert audience joins

Audience derivation is application-layer in `lib/server/sql/alert-audience.ts`
and is not configured through an HTTP endpoint:

```sql
from users u
left join user_access_groups uag on uag.user_id = u.id
left join access_group_locations agl on agl.group_id = uag.group_id
where u.active and btrim(u.email) <> ''
group by u.id
```

Admins get a null station scope, meaning every station. Non-admins get the
distinct union of their groups' `location_id` values, or an empty array when
they have no group. Delivery then filters each alert to the barrier's
station; a null or unknown station reaches only unrestricted recipients.
`alert_recipients` is the legacy manual list and is not part of this path.

## Functions and triggers

| Function                                              | Kind             | Behavior                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_contingency_flag(text)`                           | SQL, immutable   | Accent-folds and trims the value, then tests for `sim`                                                                                                                           |
| `effective_availability_id(base_id, has_contingency)` | SQL, immutable   | Maps stored 4/5 with the contingency flag to 3/2; otherwise returns the base id                                                                                                  |
| `barriers_set_compliance()`                           | trigger function | Sets `compliance_id` to 0 for effective ids 0-3 and 1 otherwise                                                                                                                  |
| `set_updated_at()`                                    | trigger function | Sets `updated_at = now()` before update                                                                                                                                          |
| `record_status_change(...)`                           | PL/pgSQL         | The sanctioned status write: sets the guard, updates status and date, inserts history. Accepts note, sync run, source author and participants; participants must be a JSON array |
| `guard_availability_write()`                          | trigger function | Raises unless `app.status_write` is `on` in the current transaction                                                                                                              |

| Trigger                        | Table and timing                                                            |
| ------------------------------ | --------------------------------------------------------------------------- |
| `trg_barriers_set_compliance`  | `barriers`, before insert or update of `availability_id`, `has_contingency` |
| `trg_guard_availability_write` | `barriers`, before update of `availability_id`                              |
| `trg_barriers_updated_at`      | `barriers`, before update                                                   |
| `trg_users_updated_at`         | `users`, before update                                                      |
| `trg_access_groups_updated_at` | `access_groups`, before update                                              |
| `trg_alert_rules_updated_at`   | `alert_rules`, before update                                                |

## Status and ownership behavior

The display overlay is defined once in SQL. A stored Degradado or
Indisponível with `has_contingency` reading as Sim is exposed as Degradado
Contingenciado or Indisponível Contingenciado. See
[STATUSES.md](STATUSES.md). Filters, KPI, chart, vocabularies and stale
alerts use `effective_availability_id()`.

`barriers.manual_fields` lists the camelCase barrier keys an admin took over
in the editor. The Fracttal sync excludes those columns from its signature
and update. A normal edit adds the edited keys; `releaseFields` removes them
so the next sync owns the column again. `availability_id` is never in this
list; status ownership stays with the history author.

## Diagnostics

`DATABASE_URL` resolves from the process environment first and `.env`
second. Deno `--env-file` never overwrites a variable already exported, so a
shell export or a service-manager value (Docker Compose, NSSM) wins
silently. The usual symptom is `password authentication failed` on the
first query while a migration run with different credentials succeeded.

1. `deno task doctor` prints the effective `user@host:port/db`, checks the
   `.env` file, API mode, URL shape, override and connection. It fails
   `database-url-override` when the process value differs from `.env`.
2. Linux: `pgrep -af 'deno serve'`, then inspect
   `/proc/<pid>/environ` for `DATABASE_URL`. The pool also logs one `pool
   config` line with user, host and database, never the password.
3. `psql -h localhost -U <user> -d <db> -c 'select current_user'` confirms
   the role and password independently of the app.
4. Make both sides agree: remove the override so `.env` wins, or rotate the
   role with `ALTER ROLE <user> WITH LOGIN PASSWORD '<new>'`. Percent-encode
   `@ : / ? #` in the URL.

`GET /api/ready` performs a config load and a database round-trip and returns
`503` with `retry-after` when either fails. `GET /api/health` stays DB-free.

## Verification

`deno task check` includes formatting, linting, type checking and the
migration-order guard. `deno task test` runs the suite; database integration
tests skip visibly when `DATABASE_URL` is unset. Schema changes must be
re-runnable, must preserve lookup ids and `external_code` compatibility, and
must update [ARCHITECTURE.md](ARCHITECTURE.md) in the same commit. See
[API.md](API.md) for the HTTP contract and [FRACTTAL.md](FRACTTAL.md) for the
upstream sync.
