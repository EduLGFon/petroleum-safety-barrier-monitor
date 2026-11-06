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

## Credential troubleshooting

`DATABASE_URL` resolves from the process environment first and `.env` second:
`deno serve --env-file=.env` (and `deno task start`) never overwrite a
variable that is already exported. A shell `export`, a systemd
`Environment=` line, or an NSSM service value therefore silently wins over
`.env`. The symptom is `password authentication failed for user "..."` on the
first query, while migrations that ran with different credentials still
succeed.

Diagnose in order:

1. `deno task doctor` - prints the effective `user@host:port/db` and fails
   `database-url-override` when the process value differs from `.env`.
2. Linux: `pgrep -af 'deno serve'`, then
   `tr '\0' '\n' < /proc/<pid>/environ | grep '^DATABASE_URL='`. The app also
   logs one `pool config` line (user/host/database, never the password) when
   the pool is created.
3. `psql -h localhost -U <user> -d <db> -c 'select current_user'` - confirms
   the role exists and accepts that password.

Then make both sides agree: remove the override so `.env` wins, or rotate the
role to the password in `.env` with
`ALTER ROLE <user> WITH LOGIN PASSWORD '...'` and percent-encode `@ : / ? #`
in the URL. `Setup-Production.ps1` syncs a pre-existing role whenever it
writes a fresh `.env`, so a new password can never desync from the role.

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

## Auth columns

- `users.auth_source`: `local` or `entra`. Entra rows carry a nullable
  password hash (null once converted or provisioned without a password).
- `users.must_change_password`: true while the account still carries a
  system-generated password. The API gate denies with
  `403 PASSWORD_CHANGE_REQUIRED` until `POST /api/auth/password` clears it.
  Only local accounts can be held; Entra conversion clears it in the same
  UPDATE. See D30 and D31.
- Pending Entra shape: `auth_source = 'entra'` with
  `(entra_tid, entra_oid) = (null, null)`. The first valid sign-in for the
  same address binds both columns at once; the pair is never half-filled.
  Bound rows match by `(entra_tid, entra_oid)` with a partial unique index on
  Entra rows. Local rows always keep both columns null. See D29.
- The legacy shared-password cleanup (`scripts/flag-shared-password-users.ts`)
  only sets `must_change_password = true` on local active rows whose hash
  still matches the legacy secret. It revokes no sessions and prints counts
  only. The cleanup file (`db/cleanup-unused-auth.sql`) still drops
  `last_login_at` and `password_resets`, but its `must_change_password` DROP
  was removed and must never be reactivated; current schema keeps the column
  above. See D32.

## Verification

`deno task check` includes the migration-order guard. Schema changes must be re-runnable and update `docs/ARCHITECTURE.md` in the same commit.
