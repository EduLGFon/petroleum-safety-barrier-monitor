# Safety Barrier Monitor

Web dashboard tracking operational state of safety barriers protecting process equipment in an oil and gas facility. Barriers are imported from the operator's upstream maintenance system (CMMS), normalised into a small Postgres model, and served to a Fresh/Preact dashboard where engineers filter by installation, criticality, availability and compliance, watch compliance trends per category, edit records, export reports, and receive emailed digests when a barrier degrades.

Everything is Deno-only: one process serves SSR pages, JSON API, dashboard island, upstream sync loop and alert digest loop. No `package.json`, no `tsconfig.json`, no ORM.

## Naming and privacy

- The third-party maintenance system is **the upstream CMMS**. Identifiers are vendor-prefixed: credential env pair (`<VENDOR>_KEY` / `<VENDOR>_SECRET`), base URL env var, `deno task <vendor>:...` shortcuts, `lib/server/<vendor>/` folder and `docs/<VENDOR>*.md` notes. Canonical names live in `.env.example`, `deno.jsonc` and `docs/`.
- Operator identity is never hardcoded; read per request from `COMPANY_NAME` (see `.env.example`). Empty value = fully unbranded product.
- No credentials, tokens, connection strings, e-mail addresses, station catalogue or tenant data are reproduced here. Sample values are placeholders.
- Real capture data, dumps and inventory spreadsheet live under `test/` (git-ignored). Committed fixtures live in `scripts/fixtures/`.

## What it does

**Dashboard**

- KPI grid: total, available, non-compliant, contingency-held, compliance %, critical non-compliant, without action plan, "other statuses" card, criticality rank strip.
- Availability status band sized by volume; clicking a segment filters the table by that status. Admins get Desativadas/Excluidas segments switching visibility scope.
- Compliance chart by category (stacked bars or executive summary with donut and Top-NC list), sortable by volume, NC rate or name, aggregated "others" tail, click-through into table.
- Table with 10 switchable, reorderable columns, sortable headers, tri-state selection, per-page and whole-filter selection scopes, "days without contingency" chips on non-compliant rows, pager with go-to-page. Full viewport width.
- Filter bar: debounced text search, typology, category, criticality rank gate (one tap for critical tiers), availability, compliance, action plan, date range.
- Barrier modal: details, full incoming/outgoing contingency links and candidates, optional Management Change and Risk Analysis references, text-only out-of-operation recommendation when no eligible contingency linked to a non-compliant barrier, status history, admin-only editing.
- Exports: CSV, XLSX and real PDF bytes over whole selected set (streamed from server as file downloads, never preview), with KPI summary blocks and branded headers.
- Header health indicator merging connection state and sync state, with per-run delta line, hover card and full audit modal listing rows a run touched.
- Settings panel: theme, accent colour, density, reduced motion, default filters, default sort, self-service password change, admin tab for users, alert recipients, alert rules and curated field options.
- pt-BR interface, three themes, eight accents, three density presets, persisted preferences, no flash of unstyled content on load.
  **Platform**

- Two data modes: in-memory deterministic generator (`mock`) and server-paged Postgres-backed API (`http`).
- Session login with two roles, opaque cookie sessions, bearer admin token for scripts, per-route rate limits, single error envelope with request ids.
- Read-only upstream sync: poll loop, one-shot replay, force-sync recovery, dry-run by default, per-run audit rows, soft deletes, truncated-page guards.
- Alert pipeline: rules, digest delivery, immediate sends, deduplication, retries and dead-letter parking.
- Docker Compose stack (app + sync poller + alert loop + one-shot toolbox), documented systemd alternative, native Windows Server 2022/2025 path (`docs/DEPLOY-WINDOWS.md`, `deploy/windows/`, `deno task doctor`).

## Stack

| Concern     | Choice                                                             |
| ----------- | ------------------------------------------------------------------ |
| Runtime     | Deno 2.9+ (verified on 2.9.7)                                      |
| Framework   | Fresh 2 (`jsr:@fresh/core`) with `@fresh/plugin-vite` and Vite 7   |
| UI          | Preact 10 + `@preact/signals`, JSX precompile, no client framework |
| Database    | PostgreSQL via `jsr:@db/postgres`, pure SQL, bound parameters      |
| Mail        | Deno-native SMTP client (STARTTLS, implicit TLS, AUTH PLAIN/LOGIN) |
| Tests       | `deno test` + `linkedom` DOM harness for hooks                     |
| Spreadsheet | `xlsx` (seed workbook coverage only; exports build PDF/CSV)        |
| Packaging   | Single Deno image, `vite build` emitting `_fresh/server.js`        |

## Quick start

### 1. Configuration

```bash
cp .env.example .env

# then set at least:
#   PUBLIC_API_MODE=mock
#   DATABASE_URL=postgres://user:password@localhost:5432/barrier_monitor
```

`dev`, `preview` and `build` do **not** read `.env`; they read the shell environment. `start`, the `db:*` tasks and the poll loops do read `.env`.

```bash
export $(grep -v '^#' .env | xargs)   # for dev / preview / build
```

Even in `mock` mode a database is required: sessions live in Postgres.

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

Visit `http://localhost:5173/login`, sign in, land on the dashboard.

### 4. Production-like run

```bash
deno task build          # vite build -> _fresh/server.js + _fresh/client
deno task start          # deno serve --env-file=.env -A --port 8300 _fresh/server.js
deno task preview        # same bundle, shell env instead of .env
```

### 5. Docker

```bash
cp .env.example .env     # set DATABASE_URL, admin token, upstream credentials
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d     # app + sync poller + alert loop
curl -s localhost:8300/api/health
```

Dev override bind-mounts the tree over the image so vite HMR and `deno --watch` loops work without rebuilding:

```bash
deno task docker:dev     # app on http://localhost:5173 with HMR
```

### 6. Upstream data (optional)

```bash
# Offline: rebuild catalog and barriers from a tenant export on disk
deno task <vendor>:import -- --dir /path/to/dump --apply

# Live: continuous read-only polling (writes the DB, never writes upstream)
deno task <vendor>:sync -- --live --apply       # one-shot
deno task <vendor>:force-sync -- --apply        # full sweep after an outage
deno task <vendor>:poll                          # long-running loop
deno task <vendor>:audit                         # read-only drift report
```

See [Upstream maintenance-system integration](#upstream-maintenance-system-integration).

## Configuration

All variables documented with comments in `.env.example`. Placeholders only here.

| Variable                                      | Default        | Purpose                                                                                                                              |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `COMPANY_NAME`                                | empty          | Operator name in header, login card, splash, page title, exports. Empty = unbranded                                                  |
| `PUBLIC_API_MODE`                             | `mock`         | `mock` = in-memory generator, `http` = Postgres-backed API routes                                                                    |
| `PUBLIC_API_BASE_URL`                         | page origin    | API root for `http` mode. Empty (recommended) = same-origin, no CORS needed                                                          |
| `DATABASE_URL`                                | -              | libpq connection string for app, migrations, seeds, scripts                                                                          |
| `ADMIN_TOKEN`                                 | -              | Bearer token (`Authorization: Bearer ...`) accepted by admin routes and scripts. Generate with `openssl rand -hex 32`                |
| `<VENDOR>_KEY` / `<VENDOR>_SECRET`            | -              | Upstream OAuth2 client-credentials pair. Read-only use, never committed                                                              |
| `<VENDOR>_BASE_URL`                           | vendor default | Upstream API root, no trailing slash                                                                                                 |
| `<VENDOR>_POLL_SECONDS`                       | `300`          | Pause between sync cycles (min 5). Effective freshness = cycle + pause                                                               |
| `<VENDOR>_SYNC_ITEM_TYPE`                     | `2`            | Upstream item type swept (2 = equipment)                                                                                             |
| `<VENDOR>_SYNC_MAX_PAGES`                     | `200`          | Item pages per cycle (100 rows each). A sweep that needs more aborts loudly                                                          |
| `<VENDOR>_SYNC_WORK_MAX_PAGES`                | `5`            | Newest work pages per endpoint per cycle, or full sweep of open statuses                                                             |
| `<VENDOR>_WORK_OPEN_ONLY`                     | `1`            | Sweep open work statuses to completion instead of newest window                                                                      |
| `<VENDOR>_RATE_PER_MIN`                       | `180`          | Initial adaptive rate (climbs toward max when clean, cuts on 406/429). Max 190, floor 80, burst 10 via `<VENDOR>_RATE_MAX/MIN/BURST` |
| `<VENDOR>_FETCH_CONCURRENCY`                  | `4`            | Parallel page fetches, reassembled in page order, rate-capped                                                                        |
| `ALERTS_POLL_SECONDS`                         | `900`          | Pause between alert digest cycles (min 60)                                                                                           |
| `OPS_SMTP_HOST` / `_PORT` / `_USER` / `_PASS` | -              | Relay for alert digests and pipeline-failure mails. `MAIL_*` are aliases. Port 465 implies implicit TLS, otherwise STARTTLS          |
| `OPS_EMAIL_TO` / `OPS_EMAIL_FROM`             | -              | Recipients and From address. `From` falls back to authenticated user                                                                 |
| `CHROME_BIN`                                  | -              | Headless Chrome binary for browser capture/smoke scripts                                                                             |

Boot fails closed: `http` mode without `DATABASE_URL` returns a `500` naming the variable; a missing upstream credential pair makes the poller exit with code 2 instead of idling.

## Command reference

| Task                                                  | What it does                                                          | Env source             |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ---------------------- |
| `dev`                                                 | Vite dev server with HMR                                              | shell only             |
| `build`                                               | `vite build` into `_fresh/`                                           | shell at build time    |
| `start`                                               | Serve built bundle (`--env-file=.env`)                                | `.env`                 |
| `preview`                                             | Serve built bundle without `--env-file`                               | shell only             |
| `check`                                               | `deno fmt --check` + `deno lint` + `deno check` over entry points     | none                   |
| `test`                                                | `deno test` with minimal permission set                               | shell + `DATABASE_URL` |
| `db:migrate`                                          | Apply `db/schema.sql` + `db/seed_lookups.sql`                         | `.env`                 |
| `db:seed`                                             | Insert mock generator's rows (batches of 500, `-- --force` truncates) | `.env`                 |
| `admin:create`                                        | Provision first (or another) admin                                    | `.env`                 |
| `<vendor>:import`                                     | Rebuild catalog + barriers from offline tenant export                 | `.env`                 |
| `<vendor>:sync`                                       | One-shot sync; default fixture replay in dry-run                      | `.env`                 |
| `<vendor>:force-sync`                                 | One-shot full live sweep that always writes (outage recovery)         | `.env`                 |
| `<vendor>:poll`                                       | Long-running sync loop (compose `poller` service)                     | `.env`                 |
| `<vendor>:audit`                                      | Read-only live-vs-database drift report per station                   | `.env`                 |
| `<vendor>:capture` / `<vendor>:extract`               | Bounded read-only live probes used to build fixtures                  | shell                  |
| `alerts:check`                                        | One-shot alert cycle; dry-run unless `-- --apply`                     | `.env`                 |
| `alerts:poll`                                         | Scheduled digest loop (compose `alerts` service)                      | `.env`                 |
| `browser:capture`                                     | Screenshot or print-to-PDF of a URL (`--mode shot                     | pdf`)                  |
| `docker:build` / `:up` / `:down` / `:logs`            | Compose stack lifecycle                                               | `.env`                 |
| `docker:migrate` / `:audit` / `:sync` / `:force-sync` | One-shot wrappers around `tools` service                              | `.env`                 |
| `docker:dev` / `:dev-down`                            | Compose with dev override (HMR, watch loops)                          | `.env`                 |

All tasks declared in `deno.jsonc`. Nothing runs against a live upstream account by accident: fixtures are default input for sync and alert tests.

## Repository layout

```
main.ts              Fresh app entry (static files + fs routes)
utils.ts             typed `define` for routes
client.ts            client entry: imports static/styles.css for HMR
vite.config.ts       @fresh/plugin-vite
deno.jsonc           tasks, import map, TS/lint/fmt config (single source of truth)
compose.yml          app + poller + alerts + tools services
compose.dev.yml      dev override: bind mounts, HMR, watch loops
Dockerfile           single-stage Deno image, `task start` as boot path
db/schema.sql        full DDL: tables, indexes, triggers, functions
db/seed_lookups.sql  idempotent static-lookup seed mirroring lib/enums
routes/              SSR pages + JSON API only
islands/             only hydrated JS (dashboard root, login form, editor)
components/          static presentational UI (no island logic)
context/             settings + theme providers
hooks/               client state: filters, derived data, server paging, sync
lib/                 shared logic: types, enums, resolve, exports, formatters
lib/api/             single data entry point: mock adapter vs HTTP adapter
lib/dashboard/       pure filtering, sorting, KPI, chart, urgency
lib/server/          server-only: db, sql repositories, auth, alerts, sync
scripts/             one-off and long-running CLIs plus replay fixtures
static/styles.css    whole design system as CSS custom properties
docs/                architecture, API, database, glossary, upstream notes
test/                git-ignored local data: tenant dump, workbook, notes
```

Roughly 300 TypeScript/TSX files, of which 60 are `*_test.ts` suites.

## Architecture

### Layer boundaries

| Layer         | Owns                                                                                           | Must never                      |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| `routes/`     | SSR pages, JSON API, strict parameter parsing, throttling, auth gates                          | render dashboard UI             |
| `islands/`    | single dashboard root, login form, barrier editor, error boundary                              | import `lib/server/*`           |
| `components/` | presentational UI, props-driven                                                                | own state machines              |
| `hooks/`      | client state, derived data, server paging, persistence, cadences                               | reach the DB                    |
| `lib/`        | shared pure logic: wire and domain types, enum resolvers, formatting, exports, dashboard maths | import Preact or `localStorage` |
| `lib/server/` | Postgres pool and repositories, auth, throttling, alert pipeline, upstream sync                | be imported from `islands/`     |

Server boundary enforced by construction: Postgres pool is a lazy singleton on `globalThis`, so importing it never throws, and only `routes/index.tsx` and `routes/api/*` import it. Connection string can never reach client bundle.

### Two data modes

`mock` (`PUBLIC_API_MODE=mock`, default): page ships full generated list as an island prop. Filtering, sorting, pagination, KPIs and chart run client-side from `lib/dashboard/*`. No fetch, no database reads for data. Useful for UI work and offline demos.

`http`: SSR seeds only vocabularies; rows never cross island boundary. Client pages through `GET /api/barriers` while KPI and chart come from their own endpoints honouring same filter subset (minus paging and sorting). Requests cancel on supersede, first paint shows splash, later refreshes keep stale rows with subtle dim, errors render full-page card (no rows yet) or inline banner with retry.

Both modes go through same `lib/api.ts` entry point, so no component knows which is active.

### Island bridge

Islands cannot read `Deno.env`, so server configuration crosses boundary as props from `routes/index.tsx`: `initialBarriers`, `companyName`, `apiMode`, `apiBaseUrl`, `vocabularies`, `sessionUser`. Settings and theme providers live inside island root for same reason. `routes/_app.tsx` inlines a small guard script restoring theme, accent, density and motion preference from `localStorage` before hydration, so no flash of wrong theme.

### Design invariants

- **Dynamic data, never fixed catalogues.** Stations, categories, typologies, owners, statuses, criticality ranks and counts can all change without code change. Vocabularies come from database, display unions are open, unknown values get deterministic fallback colours and labels.
- **Reconciling aggregations.** Fixed KPI fields plus an `other` bucket always sum to total, dynamic `by*` buckets mirror every real value, non-compliant counts derived fail-closed (`total
- compliant`).
- **Layouts survive scale.** Server paging, capped stagger delays, single-pass O(N) counting, no fixed heights assuming small data. `scripts/chaos-scale.ts` asserts contract with 50 000 synthetic rows.
- **Compliance always derived**, in client resolver, in mock adapter and in a database trigger. Never written.
- **Deletions are soft.** Rows retired by sync keep history and stay auditable behind admin-only route.

## Domain model

A **barrier** is one piece of equipment-level protection with: identity, tag, installation, typology, descriptive location, criticality, category, grouping, owner, availability, compliance, status date, comments, action plan, a block of inventory-sheet free-text fields, plus provenance (`externalCode`, `sourceUpdatedAt`, `scopeSource`) and status history.

**Availability** (display values in pt-BR, six-state vocabulary):

| Status                        | Meaning                                                |
| ----------------------------- | ------------------------------------------------------ |
| `Disponivel`                  | Free of failures or defects                            |
| `Degradado`                   | Open planned-corrective work with urgent flag (`is_urgent`) on protected asset |
| `Indisponivel`                | Open emergency-corrective work on protected asset      |
| `Degradado Contingenciado`    | Same as degraded, but a contingency is in place        |
| `Indisponivel Contingenciado` | Same as unavailable, but a contingency is in place     |
| `Fora de Operacao`            | Protected asset is out of service, positively isolated |

The two contingency states are display states over the same two base states: open corrective work plus a contingency signal (GM/CEC evidence or an explicit contingencia note in work text, or `Ha Contingencia?=Sim` on the sheet) promotes Degradado to Degradado Contingenciado and Indisponivel to Indisponivel Contingenciado. Sync auto-detects the work signal; sheet flag covers manual entries and promotes on display and on PATCH.

**Compliance** is `Conforme` or `Nao Conforme`. Any availability other than the compliant set counts as non-compliant, everywhere, consistently.
**Criticality** ranked `ESO > A > B > C > D`. `ESO` and `A` are critical tiers driving critical-non-compliant KPI, "critical only" filter default and alert urgency.
**Urgency** shared definition of "needs attention now":

| Tier       | Rule                                          |
| ---------- | --------------------------------------------- |
| `critical` | non-compliant and critical rank (`ESO` / `A`) |
| `urgent`   | any other non-compliant barrier               |
| `none`     | compliant                                     |

Ordering inside a tier: most critical first, then oldest status date, then id. Same function backs dashboard urgency card and server alert detector, so the two can never disagree.

**Vocabulary** derived from data, not seed lists: station tabs, filter options, chart categories, criticality strip and KPI breakdowns all come from whatever is loaded. New values appear as filter options on their own.

## API surface

All JSON responses use wire format (numeric ids, resolved client-side). Failures use one envelope: `{ error, code, requestId }` with `x-request-id` header and codes `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`. Internal details never reach response; they go to log with request id.

| Method           | Path                       | Auth        | Notes                                                          |
| ---------------- | -------------------------- | ----------- | -------------------------------------------------------------- |
| `GET`            | `/api/health`              | none        | Liveness; never touches database. Not throttled                |
| `GET`            | `/api/barriers`            | data        | Paged, filtered, sorted wire list plus `total` / `totalPages`  |
| `GET`            | `/api/barriers/:id`        | data        | One barrier with status history                                |
| `PATCH`          | `/api/barriers/:id/status` | admin       | Only status write path; triggers immediate alert fan-out       |
| `PATCH`          | `/api/barriers/:id`        | admin       | Partial update of core and sheet fields                        |
| `GET`            | `/api/barriers/deleted`    | admin       | Audit view of soft-deleted rows                                |
| `GET`            | `/api/kpi`                 | data        | KPI snapshot for filter subset (minus paging/sorting)          |
| `GET`            | `/api/chart`               | data        | Per-category compliant/total                                   |
| `GET`, `POST`    | `/api/export`              | data        | Streamed CSV / XLSX / PDF download over whole selection        |
| `GET`            | `/api/vocabularies`        | data        | Filter vocabularies for background refresh                     |
| `GET`            | `/api/lookups`             | any session | Id-bearing lists feeding admin forms                           |
| `GET`            | `/api/field-options`       | data        | Curated answer lists per sheet question                        |
| `PUT`            | `/api/field-options`       | admin       | Replaces one field's list                                      |
| `GET`            | `/api/sync-status`         | data        | `syncing` / `idle` / `stale` / `unknown` plus last-run counts  |
| `GET`            | `/api/sync-changes`        | data        | Rows touched by recent runs, for indicator modal               |
| `POST`           | `/api/auth/login`          | none        | Credentials to HttpOnly session cookie                         |
| `POST`           | `/api/auth/logout`         | none        | Revoke session and clear cookie                                |
| `GET`            | `/api/auth/me`             | session     | Current identity and role for islands                          |
| `POST`           | `/api/auth/password`       | session     | Self-service change; revokes every session, including this one |
| `GET`/`POST`     | `/api/users`               | admin       | List and create users (no self-registration)                   |
| `PATCH`/`DELETE` | `/api/users/:id`           | admin       | Update or remove; last active admin protected                  |
| `GET`/`POST`     | `/api/recipients`          | admin       | Alert digest audience                                          |
| `PATCH`/`DELETE` | `/api/recipients/:id`      | admin       | Rename, activate, remove                                       |
| `GET`/`POST`     | `/api/alert-rules`         | admin       | Trigger definitions                                            |
| `PATCH`/`DELETE` | `/api/alert-rules/:id`     | admin       | Edit or remove a trigger (how a category is muted)             |

Pages: `/login` is the only public route. `/` redirects anonymous visitors to `/login?next=...`, so no data ships to an unauthenticated browser.

Filter query parameters (shared by list, KPI, chart, export): `locationId`, `availabilityId`, `complianceId`, `categoryId`, `typologyId`, `criticalityId`, `criticalOnly`, `hasActionPlan`, `query`, `since`, `until`, `page`, `pageSize`, `sortCol`, `sortDir`. Omitted or `0` means "all". Unknown sort columns fall back to `id` through a whitelist, so sort input is never interpolated.

## Database

Pure SQL, no ORM, values always bound as parameters. `db/schema.sql` is source of truth and re-runnable: `create ... if not exists`, `add column if not exists` for later additions, triggers dropped before recreation, lookups upserted by id.

Tables: `locations`, `availability_statuses`, `criticality_levels`, `categories`, `groupings`, `typologies`, `owners`, `loc_descs`, `authors` (lookups); `barriers` and `barrier_status_history` (data); `sync_state` (one audit row per run); `alert_events`, `alert_recipients`, `alert_rules` (alerting); `users`, `sessions` (auth); `field_option_sets` (curated lists); `throttle_buckets` (shared rate-limit state).

Invariants:

- **Lookup ids are a contract.** Every id in static lookup tables must mean the same thing in `db/schema.sql`, `db/seed_lookups.sql` and `lib/enums/`. Never renumber a row that barriers already reference; add a new id instead. `locations` and `categories` are the dynamic pair, mirrored from the real catalogue and served to client as vocabulary.
- **Compliance is trigger-derived.** A `BEFORE INSERT OR UPDATE OF availability_id` trigger recomputes `compliance_id` from the status table, so it cannot drift even under a manual query.
- **One write path for status.** `record_status_change(barrier_id, status_id, author_id, note)` updates availability plus status date and appends history atomically. Direct `UPDATE barriers SET availability_id = ...` is rejected by the `trg_guard_availability_write` trigger. Same-status writes are a no-op (no history row, no alert).
- **Provenance and soft deletes.** `external_code` is the unique, non-null upsert match key from upstream; `deleted_at` retires a row without losing history; all normal queries filter it out.
- **Alert deduplication lives in schema.** `alert_events.dedup_key` is unique, so re-running a cycle enqueues nothing new. Sync audit rows carry `UNIQUE(run_id, barrier_id)` and one `running` lease per scope is enforced by a partial unique index.
- Indexes cover fields the API filters and sorts on. Substring search is a sequential scan by design: `pg_trgm` is not required by this schema.

## Authentication and security

- Passwords: PBKDF2-SHA256 (210 000 iterations, per-user salt, WebCrypto only), 12-256 character policy, constant-time verification, no reuse of current password.
- Sessions: 32 random bytes in an HttpOnly, SameSite=Lax cookie (Secure on https, including behind a TLS proxy when `APP_BASE_URL` is https), 12 hour TTL. Only SHA-256 hash stored, so a database leak yields no usable cookie and revocation is a row delete. Expired rows swept opportunistically on login.
- Two roles: `admin` and `user`. Only admins write status, edit records, manage users, recipients, rules and field options. Last active admin cannot be demoted, deactivated or deleted.
- First account provisioned from CLI, never self-registered.
- Self-service password change is session-only and carries no user id, so no account can address another's password through that route; it revokes every session, including caller's. Admins can reset any other user's password from the Usuarios tab (`PATCH /api/users/:id`), which revokes that user's sessions without touching caller's session.
- Anonymous API calls get a `404` shaped exactly like a missing route; dead credentials get a `401`. Writes fail closed when no credential configured at all.
- Rate limits per remote address (never `X-Forwarded-For`, forgeable): 120/min reads, 30/min writes, 120/min exports, 10/min password changes. Exports share a Postgres-backed budget across instances with in-memory fallback, so limiting never breaks request path. Export budget sized for whole-selection exports (one request per file download).
- `ADMIN_TOKEN` (constant-time compared) accepted by admin routes for scripts; rejected by password-change route on purpose.
- Same-origin by design: dashboard fetches its own `/api/*`, so no CORS headers emitted. Split-origin deployment must proxy `/api/*` through app origin.

## Upstream maintenance-system integration

Read-only against source, write-only into local database. No webhooks, so freshness comes from polling; client is GET-only by construction.

- **Client** (`lib/server/<vendor>/client.ts`): assets, one asset by code, work orders and work requests. Hard page ceiling of 100 rows, 15 s timeout, retries with exponential backoff on 5xx, one-shot token refresh on 401, shared token bucket so parallel page fetches never exceed vendor ceiling (200 requests/minute/IP; client defaults to 150 to leave margin for token refreshes, retries and shared egress). Rate-limit responses waited out rather than retried blindly; both documented header spellings accepted.
- **Validation strict and loud**: malformed envelope or unknown item type throws (upstream contract changed); malformed row collected and listed in run report. Nothing dropped silently.
- **Shared domain rules** (`barrier-rules.ts`) single converged source used by both offline importer and live sync: scope keywords, station parsing from parent chain (with documented overrides), typology precedence, work-event classification, criticality derivation and four-state availability resolution. Live run and full rebuild agree on every field.
- **Availability derivation** (fail-closed precedence): open emergency corrective work -> unavailable; open planned corrective work with urgent flag (`WR is_urgent` → `StatusEvent.isUrgent`) -> degraded; planned work without the urgent flag carries no status signal; stop flag or out-of-service date -> out of service; asset flagged not available -> unavailable; otherwise available. Winning event's date becomes status date and its source becomes barrier comments. Existing degraded rows without an urgent trigger are demoted by `scripts/backfill-degraded-urgent.ts` (dry-run default, `--apply` to write via `record_status_change`).
- **Reconciliation** pure plan (`insert` / `update` / `restore` / `delete` soft / `skip`) computed from field signature, then applied through unique upstream key. Rows that reappear restored, never duplicated.
- **Truncation guards**: truncated item page aborts run with zero writes, because partial page would read as mass deletion. Truncated work windows only narrow recency window and logged as warnings.
- **Dry-run default** everywhere. Import and one-shot sync print exactly what they would write, including availability tally, every skip reason and every malformed row. Writes require explicit `--apply`.
- **Auditability**: every run writes a `sync_state` row with status, counts and compact note; failed runs recorded before error rethrown; poller holds overlap lock and reaps orphaned `running` rows so a hard kill cannot latch dashboard into stale state.
- **Fixtures for tests**: `scripts/fixtures/` holds synthetic, anonymized pages replayed by test suite and dry-runs. Live capture bounded, writes anonymized output, reviewed before commit.

## Alerting

Two independent channels, both best-effort by contract: a throwing notifier never propagates into sync path, so a broken relay cannot take pipeline down.

- **Detection** looks at status a transition landed on, not barrier's current state, so a change the poller reverted a minute later is still reported.
- **Rules** admin-configurable per category: landing status, critical-only, recovery opt-in, stale-days trigger, immediate-versus-digest delivery. No active rule covering a category mutes it. With no rules at all, legacy behaviour applies (every non-compliant landing alerts via digest).
- **Immediate sends** happen inline after a committed status write when a matching rule asks for it: bounded by 10 second budget, single attempt, event always enqueued regardless, so digest cron is safety net.
- **Digest cycles** (compose `alerts` service or `alerts:check --apply`) detect new transitions since watermark, sweep stale barriers, enqueue idempotently, then send one digest per active recipient covering only what that recipient has not received yet.
- **Delivery bookkeeping** lives in event payload: attempts, last error, dead-letter flag, per-recipient delivered list. Partial failures resume without duplicates; event parks after 5 failed runs and can be released again with `--reprocess`.
- **Pipeline failures** reported on separate ops channel (console always, e-mail when relay configured) with scope, run id and error note, persisted so a pre-run failure still leaves a trace.
- Digests ship plain-text body plus styled HTML part, critical items first. Without configured relay digest loop runs as visible dry-run and says so in log.

## Frontend capabilities

**Table.** Sortable headers (Enter/Space, `aria-sort`), 10 columns toggleable and reorderable from portalled dialog, two extra pinned filter toggles, tri-state selection with Gmail-style scopes (page, whole filtered set, clear), row entrance staggering capped so 100-row page never feels slow. Last visible column cannot be hidden.
**Filters.** Debounced search that grows on focus, portalled combo boxes with type-to-narrow and option counts, criticality rank gate (one tap lists only critical tiers), action-plan and date-range bounds, "clear filters" when anything active, live count. Options always live vocabularies; no seed fallback. Table opens unfiltered, page size 25 (options 25/50/100), sorted by id ascending; default filters and default sort configurable in settings panel.
**Chart.** Two modes: stacked horizontal bars per category and executive summary (donut with compliance percentage plus Top-NC list). Sort by volume, NC rate or name; expand past top 20 into aggregated tail; click any row to filter table; search inside categories; density-aware geometry; plot measures its column so bars fill it in every density and monitor width (no dead space); viewport-clamped tooltip; preferences persisted.
**Selection and export.** Selection survives paging and filter changes, capped when restored, cleared on installation or filter reset. Every format exports whole selection, not loaded page, and export served by API so browser never holds rows.
**Header.** One merged health dot (sync state in core, connection state in halo) with distinct animations, status line with local time and `+N ~N -N` deltas, hover card with last run's duration and what changed, full audit modal listing rows run touched. Connection probe pings every 5 s and pauses on hidden tabs.
**Settings and theming.** Three themes (light, dark, pure black), eight accent palettes re-tinting page background, three density presets re-rhythming whole interface through CSS variables, reduced motion, default filters and sort, admin tab. Everything persists to `localStorage` and restored before hydration.
**Accessibility and keyboard.** Escape closes every overlay, Tab trapped inside dialogs and focus returns to trigger, visible focus rings, live regions for sync line and table status, reduced-motion support (toggle plus OS preference). No global single-key shortcuts.
**Client persistence.** `barrier-dashboard` (installation, filters, selection, open row, visible and pinned columns), `barrier-chart` (chart view, sort, expansion) and `barrier-settings` (theme, accent, density, motion, defaults). Every key validated per field on restore; stale saved page self-heals.

## Export formats and limits

Every format covers whole selection - including cross-page selection browser never loaded - and rows streamed from database, so file size never depends on page size.

| Format | Scope           | Ceiling                 | Contents                                                                                                                                                                                                                                                                     |
| ------ | --------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV    | whole selection | 200 000 rows per export | 30 columns, UTF-8 BOM, semicolon separated, plus `RESUMO` KPI block. Byte-identical whether produced in browser or streamed by server                                                                                                                                        |
| XLSX   | whole selection | 200 000 rows per export | Real OOXML workbook (one sheet, under Excel's 1,048,576-row limit): brand header, KPI strip, frozen header row with autofilter, fitted widths, status and criticality colours, numeric IDs, plus `Resumo` sheet. Same file whether produced in browser or streamed by server |
| PDF    | whole selection | 200 000 rows per export | Real PDF bytes: A4-landscape report with brand block, KPI chips, all 30 columns (fixed shares, wrapped text, nothing clipped at paper edge), repeated header row and footer page numbers; vector-crisp at any zoom, with no page URL stamped on it                           |

Past 200 000 rows export refused with real count so filters can be narrowed - nothing cut silently. Selection intersected with active filters on server, so stale selection cannot widen file. Files named with export date, one file per export.

## Testing and quality gates

- `deno task check` runs format check, lint, type check over entry points, and migration-order guard; `deno task test` runs suite with deliberately narrow permission set (fixtures + schema read, loopback network, only mail/database environment variables). Tests cannot reach live upstream API: everything external exercised through injected fetch stubs, scripted sockets and replay fixtures.
- 60 test files cover pure dashboard maths (filtering, sorting, KPI reconciliation, chart aggregation, urgency), hooks (through linkedom DOM harness, since JSX fixtures cannot mount outside island runtime), wire/domain resolvers, formatters, export row mapping and caps, API parameter parsing and error envelope, auth and session primitives, throttling, SQL filter whitelist, whole upstream pipeline (client validation and pacing, token cache, shared mapping rules, mapper, work signals, live scope guards, reconcile planner, poll and cycle loops, SMTP conversation, anonymization) plus alert cycle (detection, rules, one-send-per-recipient rerun safety, dead letters, immediate fan-out).
- Integration tests needing real database self-skip with visible message when `DATABASE_URL` unset, so suite stays green without one.
- `scripts/chaos-scale.ts` contract test for dynamic-data promise: 50 000 synthetic rows with brand-new status, compliance and criticality values, asserting reconciliation, novel-value handling, pagination and fallbacks.
- `scripts/browser-smoke.ts` drives headless Chrome over CDP to catch hydration and interaction bugs SSR checks cannot see; `browser:capture` produces screenshots and print PDFs. `scripts/import-sort.ts` enforces import-order convention formatter does not cover.

## Observability and operations

- Every API handler mints a request id appearing in response body, `x-request-id` header and server log line, so a user report maps to a log.
- Server logs go through `lib/server/log.ts`: timestamped single lines with level, scope and request id (`LOG_LEVEL=debug|info|warn|error`, default `info`; `LOG_FORMAT=text|json`, default `text`). `debug`/`info` go to stdout, `warn`/`error` to stderr. Secret-bearing keys (tokens, passwords, connection strings) redact to `[REDACTED]`, and log emissions never throw.
- Failure logs loud, success logs quiet. Skipped mappings, malformed rows, truncated windows and unknown vocabulary listed, never dropped.
- `/api/health` is liveness probe and deliberately does not touch database, so it answers during outage. Docker service healthcheck uses it; client connection indicator uses it every 5 s.
- Sync freshness visible from three places: `sync_state` audit table, header indicator (with run's deltas and changed rows), ops channel when run fails.
- Backup: `pg_dump -Fc` from host cron, verified by restoring into empty database and comparing row counts in `barriers` and `barrier_status_history`.
- Rollback: switch `PUBLIC_API_MODE=mock` and recreate only app service; database untouched. Full rollback is previous image plus mock mode.
- Drills worth repeating: kill poller (restart policy resumes cadence and missed tick is only a gap), post-deploy smoke test of `/` and `/api/health`.
- Stack also runs without Docker: systemd unit invoking `deno task start`, second unit for sync loop, cron entry for digest. On Windows Server 2022/2025 equivalent is NSSM services + Task Scheduler + Caddy (see `docs/DEPLOY-WINDOWS.md`); validate any host with `deno task doctor` before serving.

## Conventions for contributors

Rules enforced in review (`agents.md` holds full list):

- **Workflow**: after any change run `deno fmt`, then `deno lint`, then `deno check`, with no file arguments. Helper and scratch scripts live in `scripts/`, never in repository root.
- **Language split**: identifiers, comments, docs, logs and test names are English; user-facing strings (labels, email copy, export headers, date and duration formats) are pt-BR and never translated. `docs/GLOSSARY.md` is single source of truth for display-value to identifier mapping.
- **File hygiene**: every file opens with a comment explaining what it does and why it exists, plus comments on functions and non-obvious code. Imports ordered by descending line length (enforce with `deno task`
- `deno run -A scripts/import-sort.ts --fix`).
- **Design**: small focused files, pure functions where possible, explicit error handling, early returns, composition over inheritance, no `any` at module boundaries. External data validated at edge.
- **Architecture**: heavy logic and data access stay in `routes/` and `lib/`; `islands/` holds interactive UI only. Update `docs/ARCHITECTURE.md` in same change whenever a module, data flow, lifecycle or config changes.
- **Commits**: atomic conventional commits, one logical change each (`feat(chart): ...`, `fix(sync): ...`).

## Documentation map

| Document                     | Covers                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `docs/USO.md`                | End-user manual in Portuguese (pt-BR)                                |
| `docs/ARCHITECTURE.md`       | Modules, data flows, runtime lifecycle, island topology, config      |
| `docs/API.md`                | Wire contract, every endpoint, auth, throttling, operations          |
| `docs/DATABASE.md`           | Schema, invariants, setup walkthrough                                |
| `docs/<VENDOR>.md`           | Upstream endpoints, limits, mapping, sync service, capture procedure |
| `docs/<VENDOR>-DATA.md`      | Field census and status-derivation rules from source export          |
| `docs/GLOSSARY.md`           | Display value to identifier mapping                                  |
| `docs/STATUSES.md`           | Availability status definitions                                      |
| `scripts/fixtures/README.md` | What each replay fixture exercises                                   |
| `agents.md`                  | Workspace rules for agents and contributors                          |

## Known gaps and next steps

- Filter ergonomics still being reworked (more filters, better layout).
- Alert pipeline needs more log detail and explicit security test pass over protected endpoints.
- Upstream parity still being reconciled: criticality derivation and scope coverage are open items, coverage script reports how much of operator's manual barrier list is actually represented.
- Upstream change-log feed and out-of-service history feed probed but not consumed yet.
- Repository carries no license file; treat as internal.

Repository version: `0.4.0` (`deno.jsonc`).

## SSO

Optional Microsoft Entra ID login is available behind `AUTH_SSO_ENABLED=true`.
See `docs/SSO-ENTRA-PLAN.md`, `.env.example`, and `docs/DEPLOY-WINDOWS.md`.
