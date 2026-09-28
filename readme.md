# Safety Barrier Monitor

A web dashboard that tracks the operational state of the safety barriers that
protect process equipment in an oil and gas facility. Barriers are imported
from the operator's upstream maintenance system (CMMS), normalised into a small
Postgres model, and served to a Fresh/Preact dashboard where engineers filter
by installation, criticality, availability and compliance, watch compliance
trends per category, edit records, export reports, and get emailed digests when
a barrier degrades.

Everything is Deno-only: one process serves the SSR pages, the JSON API, the
dashboard island, the upstream sync loop and the alert digest loop. There is no
`package.json`, no `tsconfig.json`, and no ORM.

## Naming and privacy notes

- The third-party maintenance system is called **the upstream CMMS** in this
  document. Its identifiers in the code are vendor-prefixed: the credential env
  pair (`<VENDOR>_KEY` / `<VENDOR>_SECRET`), the base URL env var, the
  `deno task <vendor>:…` shortcuts, the `lib/server/<vendor>/` folder and the
  `docs/<VENDOR>*.md` notes. The canonical names live in `.env.example`,
  `deno.jsonc` and `docs/`.
- The operator identity is never hardcoded. It is read per request from
  `COMPANY_NAME` (see `.env.example`); an empty value produces a fully
  unbranded product.
- No credentials, tokens, connection strings, e-mail addresses, station
  catalogue or tenant data are reproduced here. Sample values in this file are
  placeholders.
- Real capture data, dumps and the inventory spreadsheet live under `test/`,
  which is git-ignored. Committed fixtures live in `scripts/fixtures/`.

## What it does

**Dashboard**

- KPI grid: total barriers, available, non-compliant, contingency-held,
  compliance percentage, critical non-compliant, without action plan, plus a
  catch-all "other statuses" card and a criticality rank strip.
- Availability status band sized by volume; clicking a segment filters the
  table by that status.
- Compliance chart by category (stacked bars or an executive summary with a
  donut and a Top-NC list), sortable by volume, NC rate or name, with an
  aggregated "others" tail and click-through into the table.
- Table with 10 switchable, reorderable columns, sortable headers, tri-state
  selection, per-page and whole-filter selection scopes, "days without
  contingency" chips on non-compliant rows, and pager with a go-to-page field.
  The dashboard spans the full viewport (no max-width), so the table uses the
  whole monitor instead of a centred 1400 px band.
- Filter bar: debounced text search, typology, category, criticality rank gate
  (one tap for the critical tiers), availability, compliance, action plan,
  date range.
- Barrier modal with a details tab, a status history timeline, and an admin
  editing tab.
- Exports: CSV, XLSX and PDF over the whole selected set (streamed from the
  server, split where the format needs it), with KPI summary blocks and
  branded headers.
- Header health indicator merging connection state and sync state, with a
  per-run delta line, hover card and a full audit modal listing the rows a run
  touched.
- Settings panel: theme, accent colour, density, reduced motion, default
  filters, default sort, self-service password change, and an admin tab for
  users, alert recipients, alert rules and curated field options.
- pt-BR interface, three themes, eight accents, three density presets,
  persisted preferences, no flash of unstyled content on load.

**Platform**

- Two data modes: an in-memory deterministic generator (`mock`) and a
  server-paged Postgres-backed API (`http`).
- Session login with two roles, opaque cookie sessions, a bearer admin token
  for scripts, per-route rate limits, and a single error envelope with request
  ids.
- Read-only upstream sync: poll loop, one-shot replay, force-sync recovery,
  dry-run by default, per-run audit rows, soft deletes, truncated-page guards.
- Alert pipeline: rules, digest delivery, immediate sends, deduplication,
  retries and dead-letter parking.
- Docker Compose stack (app + sync poller + alert loop + one-shot toolbox) and
  a documented systemd alternative.

## Stack

| Concern     | Choice                                                             |
| ----------- | ------------------------------------------------------------------ |
| Runtime     | Deno 2.9+ (verified on 2.9.7)                                      |
| Framework   | Fresh 2 (`jsr:@fresh/core`) with `@fresh/plugin-vite` and Vite 7   |
| UI          | Preact 10 + `@preact/signals`, JSX precompile, no client framework |
| Database    | PostgreSQL via `jsr:@db/postgres`, pure SQL, bound parameters      |
| Mail        | Deno-native SMTP client (STARTTLS, implicit TLS, AUTH PLAIN/LOGIN) |
| Tests       | `deno test` + `linkedom` DOM harness for hooks                     |
| Spreadsheet | `xlsx` (seed workbook coverage only; exports build HTML/CSV)       |
| Packaging   | Single Deno image, `vite build` emitting `_fresh/server.js`        |

## Quick start

### 1. Configuration

```bash
cp .env.example .env
# then set at least:
#   PUBLIC_API_MODE=mock
#   DATABASE_URL=postgres://user:password@localhost:5432/barrier_monitor
```

`dev`, `preview` and `build` do **not** read `.env`; they read the shell
environment. `start`, the `db:*` tasks and the poll loops do read `.env`.

```bash
export $(grep -v '^#' .env | xargs)   # for dev / preview / build
```

Even in `mock` mode a database is required: sessions live in Postgres, so the
login page needs it.

### 2. Database and first admin

```bash
deno task db:migrate     # applies db/schema.sql + db/seed_lookups.sql (idempotent)
deno task db:seed        # optional: fills demo rows from the mock generator
deno task admin:create -- --email you@example.com --password 'at-least-12-chars'
```

### 3. Run it

```bash
deno task dev            # vite dev server with HMR (default port 5173)
```

Visit `http://localhost:5173/login`, sign in, and land on the dashboard.

### 4. Production-like run

```bash
deno task build          # vite build -> _fresh/server.js + _fresh/client
deno task start          # deno serve --env-file=.env -A _fresh/server.js (port 8000)
deno task preview        # same bundle, shell env instead of .env
```

### 5. Docker

```bash
cp .env.example .env     # set DATABASE_URL, admin token, upstream credentials
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d     # app + sync poller + alert loop
curl -s localhost:8000/api/health
```

The dev override bind-mounts the tree over the image so vite HMR and
`deno --watch` loops work without rebuilding:

```bash
deno task docker:dev     # app on http://localhost:5173 with HMR
```

### 6. Upstream data (optional)

Two paths get data in:

```bash
# Offline: rebuild the catalog and barriers from a tenant export on disk
deno task <vendor>:import -- --dir /path/to/dump --apply

# Live: continuous read-only polling (writes the DB, never writes upstream)
deno task <vendor>:sync -- --live --apply       # one-shot
deno task <vendor>:force-sync -- --apply        # full sweep after an outage
deno task <vendor>:poll                          # long-running loop
deno task <vendor>:audit                         # read-only drift report
```

See [Upstream integration](#upstream-maintenance-system-integration).

## Configuration

All variables are documented with comments in `.env.example`. Placeholders only
here.

| Variable                                              | Default        | Purpose                                                                                                                     |
| ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `COMPANY_NAME`                                        | empty          | Operator name in the header, login card, splash, page title and exports. Empty = unbranded                                  |
| `PUBLIC_API_MODE`                                     | `mock`         | `mock` = in-memory generator, `http` = Postgres-backed API routes                                                           |
| `PUBLIC_API_BASE_URL`                                 | page origin    | API root for `http` mode. Empty (recommended) = same-origin, no CORS needed                                                 |
| `DATABASE_URL`                                        | -              | libpq connection string for the app, migrations, seeds and scripts                                                          |
| `ADMIN_TOKEN`                                         | -              | Bearer token (`Authorization: Bearer …`) accepted by admin routes and scripts. Generate with `openssl rand -hex 32`         |
| `<VENDOR>_KEY` / `<VENDOR>_SECRET`                    | -              | Upstream OAuth2 client-credentials pair. Read-only use, never committed                                                     |
| `<VENDOR>_BASE_URL`                                   | vendor default | Upstream API root, no trailing slash                                                                                        |
| `<VENDOR>_POLL_SECONDS`                               | `300`          | Pause between sync cycles (min 5). Effective freshness = cycle + pause                                                      |
| `<VENDOR>_SYNC_ITEM_TYPE`                             | `2`            | Upstream item type swept (2 = equipment)                                                                                    |
| `<VENDOR>_SYNC_MAX_PAGES`                             | `200`          | Item pages per cycle (100 rows each). A sweep that needs more aborts loudly                                                 |
| `<VENDOR>_SYNC_WORK_MAX_PAGES`                        | `5`            | Newest work pages per endpoint per cycle, or full sweep of open statuses                                                    |
| `<VENDOR>_WORK_OPEN_ONLY`                             | `1`            | Sweep open work statuses to completion instead of the newest window                                                         |
| `<VENDOR>_RATE_PER_MIN`                               | `150`          | Client-side token bucket for all upstream calls (vendor ceiling is 200/min)                                                 |
| `<VENDOR>_FETCH_CONCURRENCY`                          | `4`            | Parallel page fetches, reassembled in page order, rate-capped                                                               |
| `ALERTS_POLL_SECONDS`                                 | `900`          | Pause between alert digest cycles (min 60)                                                                                  |
| `OPS_SMTP_HOST` / `OPS_SMTP_PORT` / `_USER` / `_PASS` | -              | Relay for alert digests and pipeline-failure mails. `MAIL_*` are aliases. Port 465 implies implicit TLS, otherwise STARTTLS |
| `OPS_EMAIL_TO` / `OPS_EMAIL_FROM`                     | -              | Recipients and From address. `From` falls back to the authenticated user                                                    |
| `CHROME_BIN`                                          | -              | Headless Chrome binary for the browser capture/smoke scripts                                                                |

Boot fails closed: `http` mode without `DATABASE_URL` returns a `500` naming
the variable; a missing upstream credential pair makes the poller exit with
code 2 instead of idling.

## Command reference

| Task                                                  | What it does                                                                            | Env source             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| `dev`                                                 | Vite dev server with HMR                                                                | shell only             |
| `build`                                               | `vite build` into `_fresh/`                                                             | shell at build time    |
| `start`                                               | Serve the built bundle (`--env-file=.env`)                                              | `.env`                 |
| `preview`                                             | Serve the built bundle without `--env-file`                                             | shell only             |
| `check`                                               | `deno fmt --check` + `deno lint` + `deno check` over entry points                       | none                   |
| `test`                                                | `deno test` with the minimal permission set (see [Testing](#testing-and-quality-gates)) | shell + `DATABASE_URL` |
| `db:migrate`                                          | Apply `db/schema.sql` + `db/seed_lookups.sql`                                           | `.env`                 |
| `db:seed`                                             | Insert the mock generator's rows (batches of 500, `-- --force` truncates)               | `.env`                 |
| `admin:create`                                        | Provision the first (or another) admin                                                  | `.env`                 |
| `<vendor>:import`                                     | Rebuild catalog + barriers from an offline tenant export                                | `.env`                 |
| `<vendor>:sync`                                       | One-shot sync; default is fixture replay in dry-run                                     | `.env`                 |
| `<vendor>:force-sync`                                 | One-shot full live sweep that always writes (outage recovery)                           | `.env`                 |
| `<vendor>:poll`                                       | Long-running sync loop (the compose `poller` service)                                   | `.env`                 |
| `<vendor>:audit`                                      | Read-only live-vs-database drift report per station                                     | `.env`                 |
| `<vendor>:capture` / `<vendor>:extract`               | Bounded read-only live probes used to build fixtures                                    | shell                  |
| `alerts:check`                                        | One-shot alert cycle; dry-run unless `-- --apply`                                       | `.env`                 |
| `alerts:poll`                                         | Scheduled digest loop (the compose `alerts` service)                                    | `.env`                 |
| `browser:capture`                                     | Screenshot or print-to-PDF of a URL (`--mode shot\|pdf`)                                | none                   |
| `docker:build` / `:up` / `:down` / `:logs`            | Compose stack lifecycle                                                                 | `.env`                 |
| `docker:migrate` / `:audit` / `:sync` / `:force-sync` | One-shot wrappers around the `tools` service                                            | `.env`                 |
| `docker:dev` / `:dev-down`                            | Compose with the dev override (HMR, watch loops)                                        | `.env`                 |

All tasks are declared in `deno.jsonc`. Nothing runs against a live upstream
account by accident: fixtures are the default input for sync and alert tests.

## Repository layout

```
main.ts              Fresh app entry (static files + fs routes)
utils.ts             typed `define` for routes
client.ts            client entry: imports static/styles.css for HMR
vite.config.ts       @fresh/plugin-vite
deno.jsonc           tasks, import map, TS/lint/fmt config (single source of truth)
compose.yml          app + poller + alerts + tools services
compose.dev.yml      dev override: bind mounts, HMR, watch loops
Dockerfile           single-stage Deno image, `task start` as the boot path
db/schema.sql        full DDL: tables, indexes, triggers, functions
db/seed_lookups.sql  idempotent lookup seed mirroring lib/enums
routes/              SSR pages + JSON API only
islands/             the only hydrated JS (dashboard root, login form, editor)
components/          static presentational UI (no island logic)
context/             settings + theme providers
hooks/               client state: filters, derived data, server paging, sync
lib/                 shared logic: types, enums, resolve, exports, formatters
lib/api/             single data entry point: mock adapter vs HTTP adapter
lib/dashboard/       pure filtering, sorting, KPI, chart, urgency
lib/server/          server-only: db, sql repositories, auth, alerts, sync
scripts/             one-off and long-running CLIs plus replay fixtures
static/styles.css    the whole design system as CSS custom properties
docs/                architecture, API, database, glossary, upstream notes
test/                git-ignored local data: tenant dump, workbook, notes
```

Roughly 300 TypeScript/TSX files, of which 60 are `*_test.ts` suites.

## Architecture

### Layer boundaries

| Layer         | Owns                                                                                           | Must never                      |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| `routes/`     | SSR pages, the JSON API, strict parameter parsing, throttling, auth gates                      | render dashboard UI             |
| `islands/`    | the single dashboard root, the login form, the barrier editor, error boundary                  | import `lib/server/*`           |
| `components/` | presentational UI, props-driven                                                                | own state machines              |
| `hooks/`      | client state, derived data, server paging, persistence, cadences                               | reach the DB                    |
| `lib/`        | shared pure logic: wire and domain types, enum resolvers, formatting, exports, dashboard maths | import Preact or `localStorage` |
| `lib/server/` | Postgres pool and repositories, auth, throttling, alert pipeline, upstream sync                | be imported from `islands/`     |

The server boundary is enforced by construction: the Postgres pool is a lazy
singleton on `globalThis`, so importing it never throws, and only
`routes/index.tsx` and `routes/api/*` import it. The connection string can
never reach the client bundle.

### Two data modes

`mock` (`PUBLIC_API_MODE=mock`, default): the page ships the full generated
list as an island prop. Filtering, sorting, pagination, KPIs and the chart all
run client-side from `lib/dashboard/*`. No fetch, no database reads for data.
Useful for UI work and for offline demos.

`http`: SSR seeds only vocabularies; rows never cross the island boundary. The
client pages through `GET /api/barriers` while KPI and chart come from their own
endpoints honouring the same filter subset (minus paging and sorting). Requests
cancel on supersede, the first paint shows the splash, later refreshes keep
stale rows with a subtle dim, and errors render either a full-page card (no
rows yet) or an inline banner with retry.

Both modes go through the same `lib/api.ts` entry point, so no component knows
which one is active.

### Island bridge

Islands cannot read `Deno.env`, so server configuration crosses the boundary as
props from `routes/index.tsx`: `initialBarriers`, `companyName`, `apiMode`,
`apiBaseUrl`, `vocabularies` and `sessionUser`. Settings and theme providers
live inside the island root for the same reason. `routes/_app.tsx` inlines a
small guard script that restores theme, accent, density and motion preference
from `localStorage` before hydration, so there is no flash of the wrong theme.

### Design invariants

- **Dynamic data, never fixed catalogues.** Stations, categories, typologies,
  owners, statuses, criticality ranks and their counts can all change without a
  code change. Vocabularies come from the database, display unions are open,
  and unknown values get deterministic fallback colours and labels.
- **Reconciling aggregations.** Fixed KPI fields plus an `other` bucket always
  sum to the total, dynamic `by*` buckets mirror every real value, and
  non-compliant counts are derived fail-closed (`total - compliant`).
- **Layouts survive scale.** Server paging, capped stagger delays, single-pass
  O(N) counting, no fixed heights that assume small data. `scripts/chaos-scale.ts`
  asserts the contract with 50 000 synthetic rows.
- **Compliance is always derived**, in the client resolver, in the mock adapter
  and in a database trigger. It is never written.
- **Deletions are soft.** Rows retired by a sync keep their history and stay
  auditable behind an admin-only route.

## Domain model

A **barrier** is one piece of equipment-level protection with: identity, tag,
installation, typology, descriptive location, criticality, category, grouping,
owner, availability, compliance, status date, comments, action plan, a block of
inventory-sheet free-text fields, plus provenance (`externalCode`,
`sourceUpdatedAt`, `scopeSource`) and a status history.

**Availability** (display values in pt-BR, the six-state vocabulary):

| Status                        | Meaning                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `Disponível`                  | Free of failures or defects                                |
| `Degradado`                   | Open planned-corrective work on the protected asset        |
| `Indisponível`                | Open emergency-corrective work on the protected asset      |
| `Degradado Contingenciado`    | Same as degraded, but a contingency is in place            |
| `Indisponível Contingenciado` | Same as unavailable, but a contingency is in place         |
| `Fora de Operação`            | The protected asset is out of service, positively isolated |

The two contingency states are display states; the sync derives the four
operational states from upstream signals.

**Compliance** is `Conforme` or `Não Conforme`. Any availability other than the
compliant set counts as non-compliant, everywhere, consistently.

**Criticality** is ranked `ESO > A > B > C > D`. `ESO` and `A` are the critical
tiers that drive the critical-non-compliant KPI, the "critical only" filter
default and alert urgency.

**Urgency** is the shared definition of "needs attention now":

| Tier       | Rule                                              |
| ---------- | ------------------------------------------------- |
| `critical` | non-compliant **and** critical rank (`ESO` / `A`) |
| `urgent`   | any other non-compliant barrier                   |
| `none`     | compliant                                         |

Ordering inside a tier: most critical first, then oldest status date, then id.
The same function backs the dashboard urgency card and the server alert
detector, so the two can never disagree.

**Vocabulary** is derived from data, not from seed lists: the station tabs, the
filter options, the chart categories, the criticality strip and the KPI
breakdowns all come from whatever is loaded. New values appear as filter
options on their own.

## API surface

All JSON responses use the wire format (numeric ids, resolved client-side).
Failures use one envelope: `{ error, code, requestId }` with the
`x-request-id` header and codes `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`,
`RATE_LIMITED`, `INTERNAL`. Internal details never reach the response; they go
to the log with the request id.

| Method           | Path                       | Auth        | Notes                                                            |
| ---------------- | -------------------------- | ----------- | ---------------------------------------------------------------- |
| `GET`            | `/api/health`              | none        | Liveness; never touches the database. Not throttled              |
| `GET`            | `/api/barriers`            | data        | Paged, filtered, sorted wire list plus `total` / `totalPages`    |
| `GET`            | `/api/barriers/:id`        | data        | One barrier with its status history                              |
| `PATCH`          | `/api/barriers/:id/status` | admin       | The only status write path; triggers the immediate alert fan-out |
| `PATCH`          | `/api/barriers/:id`        | admin       | Partial update of core and sheet fields                          |
| `GET`            | `/api/barriers/deleted`    | admin       | Audit view of soft-deleted rows                                  |
| `GET`            | `/api/kpi`                 | data        | KPI snapshot for the filter subset (minus paging/sorting)        |
| `GET`            | `/api/chart`               | data        | Per-category compliant/total                                     |
| `GET`, `POST`    | `/api/export`              | data        | Streamed CSV / XLSX / print report over the whole selection      |
| `GET`            | `/api/vocabularies`        | data        | Filter vocabularies for the background refresh                   |
| `GET`            | `/api/lookups`             | any session | Id-bearing lists that feed the admin forms                       |
| `GET`            | `/api/field-options`       | data        | Curated answer lists per sheet question                          |
| `PUT`            | `/api/field-options`       | admin       | Replaces one field's list                                        |
| `GET`            | `/api/sync-status`         | data        | `syncing` / `idle` / `stale` / `unknown` plus last-run counts    |
| `GET`            | `/api/sync-changes`        | data        | Rows touched by recent runs, for the indicator modal             |
| `POST`           | `/api/auth/login`          | none        | Credentials to an HttpOnly session cookie                        |
| `POST`           | `/api/auth/logout`         | none        | Revoke session and clear the cookie                              |
| `GET`            | `/api/auth/me`             | session     | Current identity and role for the islands                        |
| `POST`           | `/api/auth/password`       | session     | Self-service change; revokes every session, including this one   |
| `GET`/`POST`     | `/api/users`               | admin       | List and create users (no self-registration)                     |
| `PATCH`/`DELETE` | `/api/users/:id`           | admin       | Update or remove; the last active admin is protected             |
| `GET`/`POST`     | `/api/recipients`          | admin       | Alert digest audience                                            |
| `PATCH`/`DELETE` | `/api/recipients/:id`      | admin       | Rename, activate, remove                                         |
| `GET`/`POST`     | `/api/alert-rules`         | admin       | Trigger definitions                                              |
| `PATCH`/`DELETE` | `/api/alert-rules/:id`     | admin       | Edit or remove a trigger (this is how a category is muted)       |

Pages: `/login` is the only public route. `/` redirects anonymous visitors to
`/login?next=...`, so no data ever ships to an unauthenticated browser.

Filter query parameters (shared by list, KPI, chart and export): `locationId`,
`availabilityId`, `complianceId`, `categoryId`, `typologyId`, `criticalityId`,
`criticalOnly`, `hasActionPlan`, `query`, `since`, `until`, `page`, `pageSize`,
`sortCol`, `sortDir`. Omitted or `0` means "all". Unknown sort columns fall
back to `id` through a whitelist, so sort input is never interpolated.

## Database

Pure SQL, no ORM, values always bound as parameters. `db/schema.sql` is the
source of truth and is written to be re-runnable: `create ... if not exists`,
`add column if not exists` for later additions, triggers dropped before
recreation, lookups upserted by id.

Tables: `locations`, `availability_statuses`, `criticality_levels`,
`categories`, `groupings`, `typologies`, `owners`, `loc_descs`, `authors`
(lookups); `barriers` and `barrier_status_history` (data);
`sync_state` (one audit row per run); `alert_events`, `alert_recipients`,
`alert_rules` (alerting); `users`, `sessions` (auth); `field_option_sets`
(curated lists); `throttle_buckets` (shared rate-limit state).

Invariants worth knowing before touching the schema:

- **Lookup ids are a contract.** Every id in the static lookup tables must mean
  the same thing in `db/schema.sql`, `db/seed_lookups.sql` and `lib/enums/`.
  Never renumber a row that barriers already reference; add a new id instead.
  `locations` and `categories` are the dynamic pair, mirrored from the real
  catalogue and served to the client as vocabulary.
- **Compliance is trigger-derived.** A `BEFORE INSERT OR UPDATE OF
  availability_id` trigger recomputes `compliance_id` from the status
  table, so it cannot drift even under a manual query.
- **One write path for status.** `record_status_change(barrier_id, status_id,
  author_id, note)` updates availability plus status date and appends history
  atomically. Direct `UPDATE barriers SET availability_id = ...` is never
  correct.
- **Provenance and soft deletes.** `external_code` is the unique upsert match
  key from upstream; `deleted_at` retires a row without losing history; all
  normal queries filter it out.
- **Alert deduplication lives in the schema.** `alert_events.dedup_key` is
  unique, so re-running a cycle enqueues nothing new.
- Indexes cover the fields the API filters and sorts on. Substring search is a
  sequential scan by design: `pg_trgm` is not required by this schema.

## Authentication and security

- Passwords: PBKDF2-SHA256 (210 000 iterations, per-user salt, WebCrypto only),
  12-256 character policy, constant-time verification, no reuse of the current
  password.
- Sessions: 32 random bytes in an HttpOnly, SameSite=Lax cookie (Secure on
  https), 12 hour TTL. Only the SHA-256 hash is stored, so a database leak
  yields no usable cookie and revocation is a row delete. Expired rows are swept
  opportunistically on login.
- Two roles: `admin` and `user`. Only admins write status, edit records, manage
  users, recipients, rules and field options. The last active admin cannot be
  demoted, deactivated or deleted.
- The first account is provisioned from the CLI, never self-registered.
- Password change is session-only and carries no user id, so no account can
  address another's password by construction; it revokes every session,
  including the caller's.
- Anonymous API calls get a `404` shaped exactly like a missing route;
  dead credentials get a `401`. Writes fail closed when no credential is
  configured at all.
- Rate limits per remote address (never `X-Forwarded-For`, which is forgeable):
  120/min reads, 30/min writes, 120/min exports, 10/min password changes.
  Exports share a Postgres-backed budget across instances with an in-memory
  fallback, so limiting never breaks the request path. The export budget is
  sized for a whole multi-part export (a PDF is one request per print part).
- `ADMIN_TOKEN` (constant-time compared) is accepted by admin routes for
  scripts; it is rejected by the password-change route on purpose.
- Same-origin by design: the dashboard fetches its own `/api/*`, so no CORS
  headers are emitted. A split-origin deployment must proxy `/api/*` through
  the app origin.

## Upstream maintenance-system integration

Read-only against the source, write-only into the local database. There are no
webhooks, so freshness comes from polling; the client is GET-only by
construction.

- **Client** (`lib/server/<vendor>/client.ts`): assets, one asset by code, work
  orders and work requests. Hard page ceiling of 100 rows, 15 s timeout,
  retries with exponential backoff on 5xx, one-shot token refresh on 401, and a
  shared token bucket so parallel page fetches can never exceed the vendor
  ceiling (200 requests/minute/IP; the client defaults to 150 to leave margin
  for token refreshes, retries and shared egress). Rate-limit responses are
  waited out rather than retried blindly, and both documented header spellings
  are accepted.
- **Validation is strict and loud**: a malformed envelope or an unknown item
  type throws (upstream contract changed), while a malformed row is collected
  and listed in the run report. Nothing is dropped silently.
- **Shared domain rules** (`barrier-rules.ts`) are the single converged source
  used by both the offline importer and the live sync: scope keywords, station
  parsing from the parent chain (with documented overrides), typology
  precedence, work-event classification, criticality derivation and the
  four-state availability resolution. A live run and a full rebuild therefore
  agree on every field.
- **Availability derivation** (fail-closed precedence): open emergency
  corrective work -> unavailable; open planned corrective work -> degraded;
  stop flag or out-of-service date -> out of service; asset flagged not
  available -> unavailable; otherwise available. The winning event's date
  becomes the status date and its source becomes the barrier comments.
- **Reconciliation** is a pure plan (`insert` / `update` / `restore` / `delete`
  (soft) / `skip`) computed from a field signature, then applied through the
  unique upstream key. Rows that reappear are restored, never duplicated.
- **Truncation guards**: a truncated _item_ page aborts the run with zero
  writes, because a partial page would read as mass deletion. Truncated _work_
  windows only narrow the recency window and are logged as warnings.
- **Dry-run is the default** everywhere. The import and one-shot sync print
  exactly what they would write, including the availability tally, every skip
  reason and every malformed row. Writes require an explicit `--apply`.
- **Auditability**: every run writes a `sync_state` row with status, counts and
  a compact note; failed runs are recorded before the error is rethrown; the
  poller holds an overlap lock and reaps orphaned `running` rows so a hard kill
  cannot latch the dashboard into a stale state.
- **Fixtures for tests**: `scripts/fixtures/` holds synthetic, anonymized pages
  replayed by the test suite and the dry-runs. Live capture is bounded, writes
  anonymized output, and is reviewed before being committed.

## Alerting

Two independent channels, both best-effort by contract: a throwing notifier
never propagates into the sync path, so a broken relay cannot take the pipeline
down.

- **Detection** looks at the status a transition _landed_ on, not at the
  barrier's current state, so a change the poller reverted a minute later is
  still reported.
- **Rules** are admin-configurable per category: landing status, critical-only,
  recovery opt-in, a stale-days trigger, and immediate-versus-digest delivery.
  No active rule covering a category mutes it. With no rules at all, the legacy
  behaviour applies (every non-compliant landing alerts via digest).
- **Immediate sends** happen inline after a committed status write when a
  matching rule asks for it: bounded by a 10 second budget, single attempt, and
  the event is always enqueued regardless, so the digest cron is the safety net.
- **Digest cycles** (the compose `alerts` service or `alerts:check --apply`)
  detect new transitions since a watermark, sweep stale barriers, enqueue
  idempotently, then send one digest per active recipient covering only what
  that recipient has not received yet.
- **Delivery bookkeeping** lives in the event payload: attempts, last error,
  dead-letter flag, and a per-recipient delivered list. Partial failures resume
  without duplicates; an event parks after 5 failed runs and can be released
  again with `--reprocess`.
- **Pipeline failures** are reported on a separate ops channel (console always,
  e-mail when a relay is configured) with the scope, run id and error note, and
  are persisted so a pre-run failure still leaves a trace.
- Digests ship a plain-text body plus a styled HTML part, critical items first.
  Without a configured relay the digest loop runs as a visible dry-run and says
  so in the log.

## Frontend capabilities

**Table.** Sortable headers (Enter/Space, `aria-sort`), 10 columns toggleable
and reorderable from a portalled dialog, two extra pinned filter toggles, tri-
state selection with Gmail-style scopes (page, whole filtered set, clear), and
row entrance staggering capped so a 100-row page never feels slow. The last
visible column cannot be hidden.

**Filters.** Debounced search that grows on focus, portalled combo boxes with
type-to-narrow and option counts, a criticality rank gate (one tap lists only
the critical tiers), action-plan and date-range bounds, "clear filters" when
anything is active, and a live count. Options are always the live
vocabularies; there is no seed fallback. The table opens unfiltered, page
size 25 (options 25/50/100), sorted by id ascending; the default filters and
the default sort are configurable in the settings panel.

**Chart.** Two modes: stacked horizontal bars per category and an executive
summary (donut with compliance percentage plus a Top-NC list). Sort by volume,
NC rate or name; expand past the top 20 into an aggregated tail; click any row
to filter the table; search inside categories; density-aware geometry; the
plot measures its column so the bars fill it in every density and at every
monitor width (no dead space around the drawing); viewport-clamped tooltip;
preferences persisted.

**Selection and export.** Selection survives paging and filter changes, is
capped when restored, and is cleared on installation or filter reset. Every
format exports the whole selection, not the loaded page, and the export is
served by the API so the browser never has to hold the rows.

**Header.** One merged health dot (sync state in the core, connection state in
the halo) with distinct animations, a status line with local time and
`+N ~N -N` deltas, a hover card with the last run's duration and what changed,
and a full audit modal listing the rows the run touched. A connection probe
pings every 5 s and pauses on hidden tabs.

**Settings and theming.** Three themes (light, dark, pure black), eight accent
palettes that re-tint the page background, three density presets that re-rhythm
the whole interface through CSS variables, reduced motion, default filters and
sort, and an admin tab. Everything persists to `localStorage` and is restored
before hydration.

**Accessibility and keyboard.** Escape closes every overlay, Tab is trapped
inside dialogs and focus returns to the trigger, visible focus rings, live
regions for the sync line and table status, and reduced-motion support
(toggle plus the OS preference). There are no global single-key shortcuts.

**Client persistence.** `barrier-dashboard` (installation, filters, selection,
open row, visible and pinned columns), `barrier-chart` (chart view, sort,
expansion) and `barrier-settings` (theme, accent, density, motion, defaults).
Every key is validated per field on restore, and a stale saved page self-heals.

## Export formats and limits

Every format covers the whole selection - including a cross-page selection
that the browser never loaded - and the rows are streamed from the database,
so the file size never depends on the page size.

| Format | Scope           | Ceiling                 | Contents                                                                                                                                                                                                                                                                               |
| ------ | --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV    | whole selection | 200 000 rows per export | 30 columns, UTF-8 BOM, semicolon separated, plus a `RESUMO` KPI block. Byte-identical whether produced in the browser or streamed by the server                                                                                                                                        |
| XLSX   | whole selection | 200 000 rows per export | Real OOXML workbook (one sheet, under Excel's 1,048,576-row limit): brand header, KPI strip, frozen header row with autofilter, fitted widths, status and criticality colours, numeric IDs, plus a `Resumo` sheet. Same file whether produced in the browser or streamed by the server |
| PDF    | whole selection | 200 000 rows per export | Landscape A4 print report with all 30 columns, repeating table headers and KPI chips, printed in parts of 2 000 rows (one print dialog per part)                                                                                                                                       |

Past 200 000 rows the export is refused with the real count so the filters can
be narrowed - nothing is ever cut silently. The selection is intersected with
the active filters on the server, so a stale selection cannot widen the file.
Files are named with the export date; a multi-part PDF names each part
(`...-parte-1-de-9`).

## Testing and quality gates

- `deno task check` runs format check, lint and a type check over the entry
  points, and `deno task test` runs the suite with a deliberately narrow
  permission set (fixtures read, loopback network, and only the mail/database
  environment variables). Tests cannot reach the live upstream API: everything
  external is exercised through injected fetch stubs, scripted sockets and
  replay fixtures.
- 60 test files cover the pure dashboard maths (filtering, sorting, KPI
  reconciliation, chart aggregation, urgency), hooks (through a linkedom DOM
  harness, since JSX fixtures cannot mount outside the island runtime), the
  wire/domain resolvers, formatters, export row mapping and caps, API parameter
  parsing and the error envelope, auth and session primitives, throttling, the
  SQL filter whitelist, and the whole upstream pipeline (client validation and
  pacing, token cache, shared mapping rules, mapper, work signals, live scope
  guards, reconcile planner, poll and cycle loops, SMTP conversation,
  anonymization) plus the alert cycle (detection, rules, one-send-per-recipient
  rerun safety, dead letters, immediate fan-out).
- Integration tests that need a real database self-skip with a visible message
  when `DATABASE_URL` is unset, so the suite stays green without one.
- `scripts/chaos-scale.ts` is a contract test for the dynamic-data promise: 50
  000 synthetic rows with brand-new status, compliance and criticality values,
  asserting reconciliation, novel-value handling, pagination and fallbacks.
- `scripts/browser-smoke.ts` drives headless Chrome over CDP to catch the
  hydration and interaction bugs SSR checks cannot see; `browser:capture`
  produces screenshots and print PDFs. `scripts/import-sort.ts` enforces the
  import-order convention that the formatter does not cover.

## Observability and operations

- Every API handler mints a request id that appears in the response body, the
  `x-request-id` header and the server log line, so a user report maps to a log.
- Failure logs are loud, success logs are quiet. Skipped mappings, malformed
  rows, truncated windows and unknown vocabulary are listed, never dropped.
- `/api/health` is the liveness probe and deliberately does not touch the
  database, so it answers during an outage. The Docker service healthcheck uses
  it; the client connection indicator uses it every 5 s.
- Sync freshness is visible from three places: the `sync_state` audit table, the
  header indicator (with the run's deltas and changed rows), and the ops channel
  when a run fails.
- Backup: `pg_dump -Fc` from a host cron, verified by restoring into an empty
  database and comparing row counts in `barriers` and
  `barrier_status_history`.
- Rollback: switch `PUBLIC_API_MODE=mock` and recreate only the app service;
  the database is untouched. A full rollback is the previous image plus mock
  mode.
- Drills worth repeating: kill the poller (the restart policy resumes the
  cadence and a missed tick is only a gap), and a post-deploy smoke test of `/`
  and `/api/health`.
- The stack also runs without Docker: a systemd unit invoking `deno task start`,
  a second unit for the sync loop, and a cron entry for the digest.

## Conventions for contributors

These rules are enforced in review (`agents.md` holds the full list):

- **Workflow**: after any change run `deno fmt`, then `deno lint`, then
  `deno check`, with no file arguments. Helper and scratch scripts live in
  `scripts/`, never in the repository root.
- **Language split**: identifiers, comments, docs, logs and test names are
  English; user-facing strings (labels, email copy, export headers, date and
  duration formats) are pt-BR and are never translated. `docs/GLOSSARY.md` is
  the single source of truth for the display-value to identifier mapping.
- **File hygiene**: every file opens with a comment explaining what it does and
  why it exists, plus comments on functions and non-obvious code. Imports are
  ordered by descending line length (enforce with
  `deno task` - `deno run -A scripts/import-sort.ts --fix`).
- **Design**: small focused files, pure functions where possible, explicit
  error handling, early returns, composition over inheritance, and no `any` at
  module boundaries. External data is validated at the edge.
- **Architecture**: heavy logic and data access stay in `routes/` and `lib/`;
  `islands/` holds interactive UI only. Update `docs/ARCHITECTURE.md` in the
  same change whenever a module, data flow, lifecycle or config changes.
- **Commits**: atomic conventional commits, one logical change each
  (`feat(chart): ...`, `fix(sync): ...`).

## Documentation map

| Document                     | Covers                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`       | Modules, data flows, runtime lifecycle, island topology, config      |
| `docs/API.md`                | Wire contract, every endpoint, auth, throttling, operations          |
| `docs/DATABASE.md`           | Schema, invariants, setup walkthrough                                |
| `docs/<VENDOR>.md`           | Upstream endpoints, limits, mapping, sync service, capture procedure |
| `docs/<VENDOR>-DATA.md`      | Field census and status-derivation rules from the source export      |
| `docs/GLOSSARY.md`           | Display value to identifier mapping                                  |
| `docs/STATUSES.md`           | Availability status definitions                                      |
| `scripts/fixtures/README.md` | What each replay fixture exercises                                   |
| `agents.md`                  | Workspace rules for agents and contributors                          |

## Known gaps and next steps

- Filter ergonomics are still being reworked (more filters, better layout).
- The alert pipeline needs more log detail and an explicit security test pass
  over the protected endpoints.
- Upstream parity is still being reconciled: criticality derivation and scope
  coverage are the open items, and a coverage script reports how much of the
  operator's manual barrier list is actually represented.
- The upstream change-log feed and the out-of-service history feed have been
  probed but are not consumed yet.
- This repository carries no license file; treat it as internal.

Repository version: `0.4.0` (`deno.jsonc`).
