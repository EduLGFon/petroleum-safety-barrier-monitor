# Database - Barrier Monitor

No Prisma, no ORM: pure SQL via `jsr:@db/postgres` (Deno-native `Pool`),
with values always bound as `$1/$2` args via `queryObject` (never
concatenating input into `text`; `ORDER BY` only via the `SORTABLE`
whitelist).

## Quick setup

```bash
# 1. Start a Postgres (local, Docker, RDS, Supabase, whatever you prefer)
#    and create the database:
createdb barreiras

# 2. Configure the environment variables. A single `.env` file covers it all:
#      .env        ->  deno task start / db:migrate / db:seed (--env-file=.env)
#      shell       ->  deno task dev / preview / build do NOT read --env-file;
#                       export in the shell: export $(cat .env | xargs)
#    The simple local way: cp .env.example .env, edit DATABASE_URL.

# 3. Apply the schema + seed the lookup tables
deno task db:migrate

# 4. Populate demo data (reuses the existing mock generator)
deno task db:seed

# 5. Point the app at the real API. In .env (for `start`) or exported
#    in the shell (for `dev`):
#    PUBLIC_API_MODE=http
#    PUBLIC_API_BASE_URL=        # empty = same page origin (recommended)
#    DATABASE_URL=postgres://...

deno task dev   # or: deno task start (reads .env), deno task preview (shell only)
```

Docker path (same steps inside the stack - the image carries no secrets,
the host `.env` is mounted read-only):

```bash
cp .env.example .env   # set DATABASE_URL (+ FRACTTAL_*, ADMIN_TOKEN)
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose run --rm tools deno run -A --env-file=.env scripts/fracttal-import.ts --dir /dump   # dry report; add --apply to write (mount the dump with -v /srv/dump:/dump)
docker compose up -d
```

`deno task db:migrate` and `deno task db:seed` are idempotent: running again
duplicates nothing. To reseed from scratch: `deno task db:seed -- --force`
(this truncates `barriers`/`barrier_status_history` with
`TRUNCATE ... RESTART IDENTITY CASCADE` before repopulating).

## Why pure Postgres and not an ORM

The data contract already existed before the DB: `lib/wireTypes.ts` defines
exactly what shape a `WireBarrier` has (numeric ids, see `lib/enums/`), and
`lib/api/http.ts` already knew how to consume that format. An ORM like
Prisma would impose its own schema dialect and generate types on top - here,
the queries already know exactly which format to produce because that format
was defined first, on the frontend side. Direct SQL with a Deno-native driver
keeps this layer thin: schema.sql declares the truth, the queries in
`lib/server/sql/` shape it into the wire format, with no code generation in
the middle of the way.

## Schema

```
locations              id, code, type
availability_statuses  id, label, is_compliant
criticality_levels     id, label
categories             id, label
groupings              id, label
typologies             id, label
owners                 id, label
loc_descs              id, label
authors                id, name

barriers
  id                    identity, PK
  tag                   text
  location_id           → locations
  typology_id           → typologies
  loc_desc_id           → loc_descs
  criticality_id        → criticality_levels
  category_id           → categories
  grouping_id           → groupings
  owner_id              → owners, nullable (null = "não informado")
  availability_id       → availability_statuses
  compliance_id         maintained by trigger, never written directly
  comments              text
  action_plan           text
  status_since          date
  external_code         text unique, nullable (Fracttal match key)
  source_updated_at     timestamptz, nullable
  deleted_at            timestamptz, nullable (soft delete via sync)
  created_at / updated_at

sync_state
  id                    identity, PK
  scope                 text (ex: "fixture:..." / "fracttal-live:FAL")
  status                running | ok | failed
  inserts / updates / deletes / skips
  note                  text
  started_at / finished_at

alert_events
  id                    identity, PK
  barrier_id            → barriers, on delete set null
  transition_date       date
  status_id             → availability_statuses
  kind                  default 'barrier_transition'
  dedup_key             text unique (barrier + transition date)
  payload               jsonb
  sent_at               timestamptz, nullable (null = not sent yet)

alert_recipients
  id                    identity, PK
  email                 text unique
  name                  text, default ''
  active                boolean, default true
  created_at

barrier_status_history
  id                    identity, PK
  barrier_id            → barriers, on delete cascade
  date, status_id, author_id, note
```

### Lookup tables = contract with `lib/enums/`

Every `id` in the lookup tables **must** mean exactly the same thing as the
corresponding `id` in `lib/enums/` (`codes.ts`, `taxonomy.ts`,
`context.ts`) - it is this agreement that lets the frontend resolve
`availability_id: 4` to `'Degradado'` without ever querying the DB for it.
`db/seed_lookups.sql` populates these tables id-by-id from the same values
(`ON CONFLICT(id) DO UPDATE`). If you add a new category/status/etc., add the
new row (with a new id) both to `lib/enums/` and `db/seed_lookups.sql` -
never renumber an existing row while barriers reference that id. `ALL (0)` is
UI-only, never a row in `locations` (the seed removes `id = 0` if
unreferenced); `ownerId = -1` means "no row" (`owner_id NULL`).

### `compliance_id` is derived, never written

Same as on the frontend side (`resolveBarrier` in `lib/resolve.ts` never
trusts a `complianceId` coming from the network - it always derives it from
`availabilityId`), the DB also never accepts a direct write into
`compliance_id`. A trigger (`trg_barriers_set_compliance`,
`BEFORE INSERT OR UPDATE OF availability_id`) recomputes that column from
`availability_statuses.is_compliant` every time `availability_id` is set or
changes - so the two can never drift apart, not even by an app bug or a
manual query. (`compliance_id` has `DEFAULT 1`; it is not `GENERATED` because
the native syntax forbids joins and the compliant set lives in the lookup,
not in literals.)

`updated_at` is maintained by `trg_barriers_updated_at` (`BEFORE UPDATE` via
`set_updated_at()`).

### The only write path: `record_status_change()`

Changing a barrier's status should never be a direct
`UPDATE barriers SET
availability_id = ...` - that would leave
`status_since` (when the current status started) and `barrier_status_history`
(the timeline shown in the details modal) stale. The SQL function
`record_status_change(
barrier_id, status_id, author_id, note)` does both
things atomically: it updates `availability_id` + `status_since`
(`current_date`), raises `barrier % does not exist` if missing, and inserts
the corresponding row in the history.
`transitionBarrierStatus()` in `lib/server/sql/barriers.ts` calls exactly
that function - it is the only place in the application code that should do
this.

This is already exposed via `PATCH /api/barriers/:id/status`, but the UI does
not call that endpoint yet - it is the natural path for when the
"admins can edit contingency" feature is implemented (access roles still do
not exist in the app).

### Provenance + sync (P3)

`external_code` (UNIQUE, nullable) is the upsert match key: dedup guaranteed
by the constraint, not by application logic. `deleted_at` is the soft delete -
items that disappear from Fracttal (scoped crawl) keep their row and history
intact, but `buildWhere`/`scopeText` and the `chart.ts` /
`vocabularies.ts` queries already filter `where b.deleted_at is null` by
default; an "admin" view can list deleted ones. `sync_state` records one row
per run (inserts/updates/deletes/skips counts, `status`, `note`).

### Alerts (P5)

`alert_events` queues urgent transitions: `dedup_key`
(`barrier:date:status`, UNIQUE - rerun enqueues zero), `sent_at` null until
sent, `payload` with context (tag, installation, availability,
criticality, `urgency`, `attempts`, `last_error`, `dead_letter`,
`delivered[]` per recipient). `alert_recipients` (`email` UNIQUE, `name`,
`active`) is the digest audience, managed by the admin routes
`/api/recipients*`. Cycle in `lib/server/alerts/run.ts` + script
`scripts/alerts-check.ts` (see the Operations section in docs/API.md).

## Indexes

`location_id`, `availability_id`, `compliance_id`, `category_id`, and
`criticality_id` have simple indexes - exactly the fields that
`BarriersQuery` filters on. `status_since` is also indexed, used by the
"most urgent first" ordering (`sortCol=statusSince`). `tag` has a simple btree
(`idx_barriers_tag`): equality and prefix use the index, `%q%` does a
seq-scan - trigram (`pg_trgm`) was deliberately left out so the extension is
not required (the schema drops the legacy name `idx_barriers_tag_trgm`).
History has `idx_history_barrier(barrier_id, date)`.

## Demo data seed

`scripts/seed.ts` does not reimplement the mock data generation - it imports
`getWireBarriers()` from `lib/data.ts` (the same deterministic generator that
feeds the app's "mock" mode, implemented in `lib/mock/generator.ts`) and
inserts the result into Postgres in batches of 500 rows (`BATCH_SIZE`), with
`ownerId < 0 → NULL` and `RETURNING id` preserving order for the history join.
This guarantees the demo data in the DB is identical, id by id, to what the
app would show in `PUBLIC_API_MODE=mock` - useful for comparing/debugging
the two modes side by side.

`scripts/migrate.ts` applies `db/schema.sql` + `db/seed_lookups.sql` with a
splitter that respects dollar-quoted bodies (`$$`), quotes, and comments
(including double quotes).

## Files in this layer

| File                                 | Responsibility                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/schema.sql`                      | Full DDL: tables, indexes, triggers (`trg_barriers_set_compliance`, `trg_barriers_updated_at`), functions (`barriers_set_compliance()`, `set_updated_at()`, `record_status_change()`)           |
| `db/seed_lookups.sql`                | Populates the lookup tables from `lib/enums/` (idempotent)                                                                                                                                      |
| `scripts/migrate.ts`                 | Applies the two files above against `DATABASE_URL` (pool size 1)                                                                                                                                |
| `scripts/seed.ts`                    | Populates `barriers`/`barrier_status_history` with mock data (batches of 500, `--force` truncates)                                                                                              |
| `lib/server/db.ts`                   | Lazy server-only Postgres pool (`globalThis.__barrierPool`, `queryRows<T>`)                                                                                                                     |
| `lib/server/sql/barriers.ts`         | `listBarriers` (paginated + count), `getBarrierById`, `getKpi` (fixed + `GROUP BY` buckets), `transitionBarrierStatus`                                                                          |
| `lib/server/sql/chart.ts`            | `getChartData` (`GROUP BY category_id`, `compliant` + `total`)                                                                                                                                  |
| `lib/server/sql/vocabularies.ts`     | `getVocabularies()` (labels + counts, SSR-only, no HTTP route)                                                                                                                                  |
| `lib/server/sql/where.ts`            | `buildWhere` (args `$n`, `escapeLike`), `resolveOrderBy` (whitelist `SORTABLE`)                                                                                                                 |
| `lib/server/sql/sync.ts`             | `defaultSyncIo` P3: label→id context, `loadLocal`, `startRun`/`applyPlan`/`finishRun` (upsert via `external_code` UNIQUE, `record_status_change`) + `syncScopeRunning` (poll lock, 10min stale) |
| `lib/server/fracttal/map.ts`         | Mapper P3: `mapAsset` (exact label→id resolution, skip+reason for unmapped), `availabilityFromAsset`, `IMPORT_DEFAULTS`                                                                         |
| `lib/server/fracttal/sync.ts`        | Orchestrator P3: `planReconcile` (pure), `runSync` (dry-run default), `fieldsSignature`                                                                                                         |
| `lib/server/fracttal/runner.ts`      | Poll P3: `pollOnce` (lock→run→notify), `createPollLoop` (cadence per scope, stop-safe)                                                                                                          |
| `lib/server/fracttal/notify.ts`      | Ops P3: `consoleNotifier` (always), `smtpEmailNotifier` + `smtpConfigFromEnv` (`OPS_SMTP_*`, `OPS_EMAIL_*`), `notifyFailureToAll` (best-effort)                                                 |
| `lib/server/fracttal/smtp.ts`        | Deno-native SMTP P3: EHLO, STARTTLS (reader released for `Deno.startTls`), AUTH PLAIN, dot-stuffing                                                                                             |
| `lib/server/sql/mappers.ts`          | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`, `toHistory`                                                                                                             |
| `lib/server/config.ts`               | `loadServerConfig` (http boot), `loadSyncConfig` (Fracttal credentials for scripts)                                                                                                             |
| `lib/server/errors.ts`               | `{ error, code, requestId }` envelope + `x-request-id`                                                                                                                                          |
| `lib/server/auth.ts`                 | `checkAdminAuth` (Bearer `ADMIN_TOKEN`, fail-closed, with `role`)                                                                                                                               |
| `lib/server/throttle.ts`             | `createThrottle` (fixed window, no deps) + per-route buckets                                                                                                                                    |
| `lib/server/exportCsv.ts`            | `streamExportCsv` (BOM + `row()` + `summaryRows()`, chunks of 500)                                                                                                                              |
| `lib/server/sql/recipients.ts`       | CRUD `alert_recipients` (pure validation + thin store)                                                                                                                                          |
| `lib/server/sql/alerts.ts`           | `sqlAlertStore` (`ON CONFLICT dedup_key DO NOTHING`, dead-letter in payload)                                                                                                                    |
| `lib/server/alerts/store.ts`         | `AlertStore` contract (dedup, `delivered[]` per recipient)                                                                                                                                      |
| `lib/server/alerts/detect.ts`        | `detectUrgentTransitions` (history → `isUrgent`, same predicate as the dashboard)                                                                                                               |
| `lib/server/alerts/run.ts`           | `runAlertCycle` (detect→enqueue→digest→mark, dry-run default, `--reprocess`)                                                                                                                    |
| `lib/server/alerts/mailer.ts`        | `AlertMailer` + SMTP provider (P3 reuse) + `sendWithRetry`                                                                                                                                      |
| `lib/server/alerts/templates.ts`     | Urgent digest pt-BR (subject counts criticals, body lists criticals first)                                                                                                                      |
| `lib/dashboard/urgent.ts`            | `urgencyOf`/`isUrgent`/`compareUrgency`/`urgentBarriers` (fail-closed baseline = NcAlert)                                                                                                       |
| `routes/api/_params.ts`              | Shared strict parsers (`parseInt/parseDate/parseQueryParam`)                                                                                                                                    |
| `routes/api/barriers.ts`             | `GET /api/barriers`                                                                                                                                                                             |
| `routes/api/barriers/[id].ts`        | `GET /api/barriers/:id`                                                                                                                                                                         |
| `routes/api/barriers/[id]/status.ts` | `PATCH /api/barriers/:id/status` (bonus)                                                                                                                                                        |
| `routes/api/kpi.ts`                  | `GET /api/kpi`                                                                                                                                                                                  |
| `routes/api/chart.ts`                | `GET /api/chart`                                                                                                                                                                                |
| `routes/api/health.ts`               | `GET /api/health` (liveness, no DB)                                                                                                                                                             |
