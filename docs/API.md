# API layer - Barrier Monitor

## Overview

Every piece of data that feeds the dashboard goes through a single entry point:
**`lib/api.ts`** (barrel over `lib/api/*`). No component or hook accesses
the mock generator or a real backend directly - they all call
`api.getBarriers(...)`, `api.getAllBarriers(...)`, `api.getBarrierById(...)`,
`api.getKpi(...)` or `api.getChartData(...)`.

```
routes/index.tsx (SSR: full list in mock, vocabularies in http)
        │
        ▼
islands/Dashboard.tsx (island root: Settings + Theme providers)
        │
        ▼
islands/dashboard/DashboardView.tsx (ClientView vs ServerView)
        │
        ├── mock: hooks/useDashboard.ts (client-side aggregation)
        └── http: hooks/dashboard/server.ts (pages via fetch)
                │
                ▼
           lib/api.ts  ◄── single entry point
           ├── mockAdapter (lib/api/mock.ts over lib/mock/generator.ts)
           └── httpAdapterFactory(baseUrl) (lib/api/http.ts over fetch)
```

## Wire format (numbers, not text)

A real backend exchanges data using **numeric codes**, never display strings.
This avoids large payloads, localization issues, and lets you rename labels
without breaking contracts.

Every enumerable domain has a resolver in **`lib/enums/`** (barrel
`lib/enums.ts` over `codes.ts`, `taxonomy.ts`, `context.ts`):

```ts
// Location (installation)
LOCATION_CODES = {
  0: "ALL",
  1: "FAL",
  2: "CNC",
  3: "CNS",
  4: "FAP",
  5: "RJO",
  6: "SPL",
};
toLocationId("FAL"); // -> 1
fromLocationId(1); // -> 'FAL'

// Availability
AVAILABILITY_CODES = {
  0: "Disponível",
  1: "Fora de Operação",
  2: "Indisponível Contingenciado",
  3: "Degradado Contingenciado",
  4: "Degradado",
  5: "Indisponível",
};

// Compliance
COMPLIANCE_CODES = { 0: "Conforme", 1: "Não Conforme" };

// Criticality
CRITICALITY_CODES = { 0: "Não Crítica", 1: "Crítica" };

// Barrier category, grouping, typology, owner, descriptive location, and
// history author - all follow the same pattern (see lib/enums/).
```

Each domain exposes `toXId(string) -> number | undefined` (undefined = unknown
value, the filter is skipped with a warning) and `fromXId(number) -> string`
(an explicit sentinel like `ST-7`, never a plausible known label).

## Wire types vs domain types

- **`lib/wireTypes.ts`** - `WireBarrier`, `WireStatusHistoryEntry`,
  `WireKpiSnapshot`, `WireCategoryCompliance`, `BarriersQuery`,
  `BarriersResponse`: exactly what travels over the network (only numbers + a
  few free-text fields like `tag`, `comments`, `actionPlan`).
- **`lib/types.ts`** - `Barrier`, `KpiSnapshot`, `CategoryCompliance`,
  `Vocabularies`, `FilterState`, `SortableColumn`, `StatusHistoryEntry`: the
  domain types the UI uses, always with already-resolved, readable strings.
  Vocabularies use open unions (`string & {}`) so new station values compile
  without a code change.
- **`lib/api/types.ts`** - `BarriersApi` (5 methods) + `DomainQuery` (filters
  as strings that the UI uses).
- **`lib/resolve.ts`** - `resolveBarrier(s)`, `resolveHistoryEntry`,
  `resolveKpi`, `resolveChartData`: converts wire -> domain (the inverse is not
  needed, since the frontend never has to convert back to IDs when displaying).

Important: `compliance` **never** travels in `WireBarrier` - it is always
derived from `availabilityId` via `isCompliant()`, in the mock
(`lib/api/mock.ts`), in the resolver (`resolveBarrier`), and in the DB via the
trigger (`trg_barriers_set_compliance` on the stored column
`barriers.compliance_id`, used only for SQL filter/aggregation).

`WireKpiSnapshot` carries the fixed fields plus the optional dynamic buckets
`byAvailability`, `byCompliance`, `byCriticality` (keys = numeric id as
string) and `syncedAt` (server ISO). `resolveKpi` translates the keys to
display strings (already-string keys pass through intact for compat with older
servers); when the buckets are absent the UI uses the fixed fields (covers
only the known statuses).

`WireCategoryCompliance` carries `{ categoryId, compliant, total }`;
`resolveChartData` derives `Não Conforme = max(0, total - compliant)`
(fail-closed, same as `computeChartData`); names stay full (the 26-char
shortening is presentation-only in `ChartRow`, so chart rows can filter the
table by exact category).

## Using the real API (Postgres)

The handlers `httpAdapterFactory` expects (barriers, `:id`, kpi, chart) plus
the write/admin/export ones are already implemented in `routes/api/`, on
PostgreSQL (no ORM - pure SQL via `jsr:@db/postgres`, values bound as `$1/$2`).
Full inventory: `barriers`, `barriers/deleted`,
`barriers/:id`, `barriers/:id/status`, `export`, `kpi`, `chart`, `health`,
`recipients`, `recipients/:id` (`_params.ts` is only parsers, never a route):

- `GET /api/barriers?locationId=1&availabilityId=4&complianceId=1&categoryId=2&query=FAL&since=2024-01-01&until=2024-12-31&page=1&pageSize=25&sortCol=statusSince&sortDir=desc` →
  `BarriersResponse { items: WireBarrier[], total, page, pageSize, totalPages }`
  - `locationId` omitted/`0` = all; `query` matches `tag ILIKE %q% OR loc.code`
    (`\%_` escaped, capped at 200 chars); `since`/`until` = `YYYY-MM-DD` over
    `status_since`; `page` default 1 (floor, min 1); `pageSize` default 25
    (clamped `1..100000`); `sortCol` whitelist
    (`id/tag/criticality/category/availability/compliance/statusSince`,
    default `id`); strict parsers in `routes/api/_params.ts`; `{ error, code,
    requestId }` envelope on DB failure (see the P4 section below).
- `GET /api/barriers/:id` → `WireBarrier` (`400` invalid id, `404` missing)
- `PATCH /api/barriers/:id/status` with
  `{ statusId: int >= 0, authorId?: int >= 0, note?: string (cap 2000) }` →
  updated `WireBarrier` via `record_status_change()` (`400` invalid body,
  `404` missing). Requires admin (session cookie or
  `Authorization: Bearer <ADMIN_TOKEN>`). Session admins may omit
  `authorId` (derived from their user via `authors`); token callers must
  send it. `401` without credentials, `401` also when neither is
  configured - writes are never allowed by omission. After the commit the
  route runs the hybrid immediate fan-out: matches always enqueue in
  `alert_events`, and winning rules with `notify_immediate` send at once
  (`[Imediato]` subject, single attempt, 10s budget) when the SMTP relay
  is configured - otherwise the digest cron sends. Fan-out failures only
  log; the response stays the updated `WireBarrier`.
- `GET /api/export?format=csv` (+ the same filters as `/api/barriers`) →
  CSV with BOM, 14-column header, data rows, `RESUMO` block
  (byte-identical to the dashboard CSV: `row()` + `csvCell()` + `summaryRows()`).
  Stream via `ReadableStream` (chunks of 500 rows), cap of 10,000 rows
  (`400` with the filtered total when exceeded - refine the filters),
  `Content-Disposition: attachment`, `X-Export-Total` with the filtered total.
- `GET /api/barriers/deleted` (+ the same filters) → `BarriersResponse`
  with only deleted rows (soft-delete sync audit). Requires
  `ADMIN_TOKEN`; the `/api/barriers/:id` detail keeps hiding deleted ones.
- `GET /api/kpi?locationId=1&availabilityId=4&...` → `WireKpiSnapshot`
  over the same filter subset as the table (location, availability,
  compliance, category, text, dates; omitted = all)
- `GET /api/chart?...` (same filter subset) → `WireCategoryCompliance[]`
- `GET /api/vocabularies` → `Vocabularies` (id-bearing locations +
  categories for the refresh cadence; SSR still seeds the first paint)
- `GET /api/sync-status` → `SyncStatus` (`state` syncing/idle/stale/unknown,
  `runningSince`, last finished run with counts + note, tracked barrier
  total) for the dashboard indicator; same 5-minute cadence as vocabularies
- `GET /api/health` → `{ ok, time }` (liveness, no DB)
- `GET /api/recipients` (+ `?activeOnly=1`), `POST /api/recipients`
  `{ email, name? }` (upsert by email, `201`), `PATCH /api/recipients/:id`
  `{ name?, active? }`, `DELETE /api/recipients/:id` → `{ ok: true }` -
  all require admin (session or `Bearer <ADMIN_TOKEN>`, including GET:
  addresses are admin data).
- `POST /api/auth/login` `{ email, password }` → public user + HttpOnly
  session cookie (`401` generic on bad credentials); `GET /api/auth/me` →
  current session user (`401` without one); `POST /api/auth/logout` →
  `{ ok: true }` + cleared cookie; `POST /api/auth/password`
  `{ currentPassword, newPassword }` → `{ ok: true }` + cleared cookie -
  self-service change for any active session (admin or user; `ADMIN_TOKEN`
  rejected, identity comes from the session alone so no user can address
  another's password). Requires the current password, enforces the 12–256
  policy, rejects reuse, revokes every session (re-login everywhere).
- `GET /api/users`, `POST /api/users` `{ email, name?, password (12+),
  role? }` (`201`; first user on an empty table becomes admin without
  auth), `PATCH /api/users/:id` `{ name?, role?, active?, password? }`,
  `DELETE /api/users/:id` → `{ ok: true }` - all but bootstrap require
  admin; the last active admin cannot be demoted, deactivated, or deleted.
- `GET /api/alert-rules` (+ `?activeOnly=1`), `POST /api/alert-rules`
  `{ name, categoryId?, toStatusId?, criticalOnly?, includeRecovery?,
  staleDays?, notifyImmediate?, active? }` (`201`),
  `PATCH /api/alert-rules/:id`, `DELETE /api/alert-rules/:id` → `{ ok: true }`
  - all require admin. `categoryId: null` means all categories; no active
    rule covering a category mutes it.
- `GET /api/lookups` → `{ availabilities: [{ id, label }],
  categories: [{ id, label }], authors: [{ id, name }] }` - requires any
  authenticated caller (session or token); feeds the admin forms.

## Errors, auth, and throttle (P4)

Every failure responds with the `{ error, code, requestId }` envelope + the
`x-request-id` header (`code`: `BAD_REQUEST` / `NOT_FOUND` / `UNAUTHORIZED` /
`RATE_LIMITED` / `INTERNAL`; `500` never leaks a stack or column - the public
message is fixed per route and the detail goes to the log with the `requestId`).

Login => Dashboard: **dashboard GETs require auth** (`barriers`, `:id`,
`kpi`, `chart`, `export`, `vocabularies`) - session cookie or `ADMIN_TOKEN`.
Anonymous callers get `404` camouflage (`NOT_FOUND`, same shape as a missing
route); dead credentials get `401`. **Writes and admin data require
admin** (session cookie or `ADMIN_TOKEN`): `PATCH .../status`, recipients,
users, alert-rules, `GET /api/barriers/deleted`, `GET /api/lookups`.
`403` never leaks existence; `admin only` when a non-admin session calls.
Pages: `/login` is the only public route - `/` redirects logged-out
sessions to `/login?next=`. Admin management lives in the settings
sidepanel Admin tab (admin role only); the admin APIs below stay
server-enforced regardless of what the drawer shows.

In-memory throttle by remote IP (never `X-Forwarded-For`, which is forgeable):
120 req/min on reads, 30 req/min on writes, 10 req/min on export and on
self-service password changes
(`429 { error, code: RATE_LIMITED }` + `Retry-After`). `/api/health` is not
throttled (liveness probe). The export additionally shares its budget across
isolates via the `throttle_buckets` table (`lib/server/sql/throttle.ts`,
memory fallback). Boot validates `DATABASE_URL` with
`PUBLIC_API_MODE=http` on the first call (`500` naming the variable).

`GET /api/vocabularies` refreshes the same payload on the dashboard
cadence (SSR still seeds the first paint in http mode via
`routes/index.tsx`; mock mode derives options client-side via
`useDashboardVocabularies`).

In `PUBLIC_API_MODE=http` the dashboard pages through the server
(`useServerDashboard` in `hooks/dashboard/server.ts`): pages via
`getBarriers` (full filters), KPI via `getKpi`, and chart via
`getChartData` (same filter subset, minus paging/sort), with cancellation,
loading, error card/banner, retry, a 5-minute refresh cadence (hidden tabs
skip), and vocabulary refetch. `getAllBarriers` in http forces
`pageSize: 100000`. CSV export streams the full filtered set from
`GET /api/export` (10k cap); xls/pdf stay page-local; detail resolves from
the current page.

To enable:

1. Start a Postgres and run the migrations + seed (see **docs/DATABASE.md**
   for the full step-by-step).
2. Set the environment variables (see `.env.example`):
   ```
   PUBLIC_API_MODE=http
   PUBLIC_API_BASE_URL=          # empty = same page origin (recommended)
   DATABASE_URL=postgres://user:password@localhost:5432/barreiras
   ```
   (`dev` reads from the shell - `export $(cat .env | xargs)`; `start`/`db:*`
   read `.env`.) When `PUBLIC_API_BASE_URL` is empty, the
   `routes/index.tsx` route uses the request's own origin - the browser
   fetches `/api/*` same-origin on whatever port the app is serving. Set the
   variable explicitly only when the API is on another origin (that origin
   then needs CORS headers on the API).
3. No component needs to change. `api` in `lib/api.ts` points to
   `httpAdapter` automatically, which now talks to these routes.

The entire SQL layer (`lib/server/db.ts`, `lib/server/sql/*`) is server-only
(never imported in `islands/`) - the Postgres connection string never reaches
the client bundle. `lib/server/db.ts` uses a lazy pool on
`globalThis.__barrierPool` (the import never throws; the first query throws
without `DATABASE_URL`).

## Filter query (string -> wire)

The `toWireQuery()` function in `lib/api/query.ts` (re-exported by
`lib/api.ts`) converts the filters the UI uses (strings like `'Degradado'`,
`'FAL'`) into the numeric `BarriersQuery` both the mock and the real backend
expect. Unknown values are skipped with `console.warn`.
`cleanDateParam` accepts `YYYY-MM-DD` (or longer ISO) and `buildQueryString`
serializes to the URL:

```ts
toWireQuery({ location: "FAL", availability: "Degradado", page: 1 });
// -> { locationId: 1, availabilityId: 4, page: 1 }
```

## Files in this layer

| File                                 | Responsibility                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                         | Barrel: picks mock vs HTTP via `PUBLIC_API_MODE`, re-exports `toWireQuery` + `mockApi`                        |
| `lib/api/types.ts`                   | `BarriersApi` (5 methods) + `DomainQuery` (string filters)                                                    |
| `lib/api/query.ts`                   | `toWireQuery`, `cleanDateParam`, `buildQueryString`                                                           |
| `lib/api/mock.ts`                    | `mockAdapter`: numeric `matchesQuery` + `sortWire`, resolves only the final page                              |
| `lib/api/http.ts`                    | `httpAdapterFactory(baseUrl)`: fetch over `routes/api/*`; `null` only on 404                                  |
| `lib/enums.ts`                       | Barrel over `lib/enums/`                                                                                      |
| `lib/enums/codes.ts`                 | `LOCATION/AVAILABILITY/COMPLIANCE/CRITICALITY` + `to/fromXId`                                                 |
| `lib/enums/taxonomy.ts`              | `CATEGORY/GROUPING/TYPOLOGY/OWNER` (`ownerId -1` = empty)                                                     |
| `lib/enums/context.ts`               | `LOC_DESC/AUTHOR` (from* only)                                                                                |
| `lib/wireTypes.ts`                   | Wire format (numeric ids; no `complianceId` in `WireBarrier`)                                                 |
| `lib/types.ts`                       | UI domain (resolved strings, open unions, `Vocabularies`)                                                     |
| `lib/resolve.ts`                     | `resolveBarrier(s)`, `resolveHistoryEntry`, `resolveKpi`, `resolveChartData`                                  |
| `lib/data.ts`                        | Barrel over `lib/mock/` (deterministic generator)                                                             |
| `lib/mock/generator.ts`              | `getWireBarriers()` cached (`0xdeadbeef`, status/station distributions)                                       |
| `lib/mock/history.ts`                | `generateHistory` + comments/plans/notes per status                                                           |
| `lib/mock/tags.ts`                   | `buildTag` + prefixes per category                                                                            |
| `lib/mock/rng.ts`                    | PRNG with seed (`next/int/pick/bool`)                                                                         |
| `lib/constants.ts`                   | Barrel over `lib/constants/`                                                                                  |
| `lib/constants/locations.ts`         | `LOCATIONS`, `LOCATION_DIST_BY_ID`, `SIM_DATE`, `PAGE_SIZE(_OPTS)`                                            |
| `lib/constants/catalog.ts`           | Seed lists (categories, groupings, typologies, owners, locs, authors)                                         |
| `lib/constants/helpers.ts`           | `isCompliant()` + `distinctBy()`                                                                              |
| `lib/constants/colors.ts`            | Colors per status + `DISP_KNOWN_ORDER`, `shortStatusLabel`                                                    |
| `lib/server/db.ts`                   | Lazy server-only Postgres pool (`globalThis.__barrierPool`)                                                   |
| `lib/server/sql/barriers.ts`         | `listBarriers`, `getBarrierById`, `getKpi`, `transitionBarrierStatus`                                         |
| `lib/server/sql/chart.ts`            | `getChartData` (`GROUP BY category_id`)                                                                       |
| `lib/server/sql/vocabularies.ts`     | `getVocabularies()` (SSR seed + `GET /api/vocabularies` refresh)                                              |
| `lib/server/sql/where.ts`            | `buildWhere`, `resolveOrderBy` (whitelist), `escapeLike`                                                      |
| `lib/server/sql/mappers.ts`          | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`                                        |
| `routes/api/_params.ts`              | Strict parsers (`parseInt/parseDate/parseQueryParam`); never a route (`_` prefix)                             |
| `routes/api/barriers.ts`             | `GET /api/barriers` (session/token, read throttle)                                                            |
| `routes/api/barriers/deleted.ts`     | `GET /api/barriers/deleted` (deleted only, requires `ADMIN_TOKEN`)                                            |
| `routes/api/barriers/[id].ts`        | `GET /api/barriers/:id` (session/token, read throttle)                                                        |
| `routes/api/barriers/[id]/status.ts` | `PATCH /api/barriers/:id/status` (requires admin, write throttle; author derives from session)                |
| `routes/api/export.ts`               | `GET /api/export?format=csv` (session/token, export throttle, 10k cap, stream)                                |
| `routes/api/kpi.ts`                  | `GET /api/kpi` (session/token, read throttle)                                                                 |
| `routes/api/chart.ts`                | `GET /api/chart` (session/token, read throttle)                                                               |
| `routes/api/sync-status.ts`          | `GET /api/sync-status` (session/token, read throttle; dashboard indicator)                                    |
| `routes/api/health.ts`               | `GET /api/health` (liveness, no DB, no throttle)                                                              |
| `routes/api/recipients.ts`           | `GET/POST /api/recipients` (admin, upsert by email)                                                           |
| `routes/api/recipients/[id].ts`      | `PATCH/DELETE /api/recipients/:id` (admin)                                                                    |
| `routes/api/auth/login.ts`           | `POST /api/auth/login` (credentials → session cookie)                                                         |
| `routes/api/auth/logout.ts`          | `POST /api/auth/logout` (revoke + clear cookie)                                                               |
| `routes/api/auth/me.ts`              | `GET /api/auth/me` (session user for islands)                                                                 |
| `routes/api/auth/password.ts`        | `POST /api/auth/password` (own password change, session-only)                                                 |
| `routes/api/users.ts`                | `GET/POST /api/users` (admin; bootstrap first admin)                                                          |
| `routes/api/users/[id].ts`           | `PATCH/DELETE /api/users/:id` (admin, last-admin guard)                                                       |
| `routes/api/alert-rules.ts`          | `GET/POST /api/alert-rules` (admin, per-category triggers)                                                    |
| `routes/api/alert-rules/[id].ts`     | `PATCH/DELETE /api/alert-rules/:id` (admin)                                                                   |
| `routes/api/lookups.ts`              | `GET /api/lookups` (authenticated id lists for admin forms)                                                   |
| `lib/server/config.ts`               | `loadServerConfig` (http boot), `loadSyncConfig` (Fracttal credentials for scripts)                           |
| `lib/server/errors.ts`               | Envelope `{ error, code, requestId }` + `x-request-id`                                                        |
| `lib/server/auth.ts`                 | `checkAdminAuth` (Bearer) + `resolveRequestAuth`/`requireAdminAuth`/`requireAuthenticated` (session or token) |
| `lib/server/throttle.ts`             | `createThrottle` (fixed window, no deps) + per-route buckets                                                  |
| `lib/server/sql/throttle.ts`         | Postgres `throttle_buckets` budget shared across isolates (memory fallback)                                   |
| `lib/server/exportCsv.ts`            | `streamExportCsv` (BOM + `row()` + `summaryRows()`, chunks of 500)                                            |
| `lib/server/sql/recipients.ts`       | CRUD `alert_recipients` (pure validation + thin store)                                                        |
| `lib/server/sql/users.ts`            | CRUD `users` (roles, last-admin guard, no hashes in JSON)                                                     |
| `lib/server/sql/sessions.ts`         | Opaque `sessions` (hash lookup, revoke, expiry sweep)                                                         |
| `lib/server/sql/authors.ts`          | `listAuthors` + `getOrCreateAuthor` (session → author id)                                                     |
| `lib/server/sql/alert_rules.ts`      | CRUD `alert_rules` + `listStaleBarriers` (time trigger)                                                       |
| `lib/server/auth/password.ts`        | PBKDF2-SHA256 hash/verify + 12-char policy (WebCrypto only)                                                   |
| `lib/server/auth/session.ts`         | Opaque token, SHA-256 hash, HttpOnly cookie builders                                                          |
| `lib/server/alerts/store.ts`         | `AlertStore` contract (dedup, `delivered[]` per recipient)                                                    |
| `lib/server/alerts/rules.ts`         | Pure rule matching (category scope, critical, recovery, immediacy)                                            |
| `lib/server/alerts/detect.ts`        | `detectUrgentTransitions` (history → rules, legacy fallback)                                                  |
| `lib/server/alerts/immediate.ts`     | `maybeSendImmediate` (PATCH fan-out: enqueue always, at-once send on immediate rules)                         |
| `lib/server/alerts/run.ts`           | `runAlertCycle` (detect→stale→enqueue→digest→mark, dry-run default, `--reprocess`)                            |
| `lib/server/alerts/mailer.ts`        | `AlertMailer` + SMTP provider (P3 reuse) + `sendWithRetry`                                                    |
| `lib/server/alerts/templates.ts`     | Urgent digest pt-BR (subject counts criticals, body lists criticals first)                                    |
| `lib/server/sql/alerts.ts`           | `sqlAlertStore` (`ON CONFLICT dedup_key DO NOTHING`, dead-letter in payload)                                  |
| `lib/dashboard/urgent.ts`            | `urgencyOf`/`isUrgent`/`compareUrgency`/`urgentBarriers` (fail-closed baseline = NcAlert)                     |
| `islands/dashboard/vocabularies.ts`  | Client hook `useDashboardVocabularies` (mock mode only)                                                       |
| `db/schema.sql`                      | DDL: lookup tables, `barriers`, `barrier_status_history`                                                      |
| `db/seed_lookups.sql`                | Seeds the lookup tables, mirroring `lib/enums/`                                                               |

See **docs/DATABASE.md** for the full schema and setup walkthrough, and
**docs/ARCHITECTURE.md** for the mock vs http flows and the island topology.

## Operations (P5)

### Docker runtime (primary)

```bash
cp .env.example .env   # set DATABASE_URL + FRACTTAL_* + ADMIN_TOKEN (+ OPS_*)
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d                       # app + poller
curl -s localhost:8000/api/health          # {"ok":true,...}
docker compose ps                          # both healthy / running
```

- Config comes from the host `.env` (mounted read-only, never baked into
  the image - see `.dockerignore`). `deno task fracttal:*` shortcuts mirror
  the scripts for local runs.
- Alert digest stays a host cron calling into the stack (every 15 min):
  `*/15 * * * * cd /opt/barrier-monitor && docker compose run --rm tools
  deno run -A --env-file=.env scripts/alerts-check.ts --apply
  >> /var/log/alerts.log 2>&1`(drop`--apply` for a dry-run).
- Backup stays a host cron (`pg_dump "$DATABASE_URL" -Fc`), verified by
  restore into an empty DB with identical `barriers` /
  `barrier_status_history` counts (see below).

Drills (acceptance):

- Kill-poller: `docker kill <poller-container>` → `unless-stopped` restarts
  it; `docker compose logs poller` shows the cadence resuming, and a missed
  tick is just a gap (the next tick reconciles; nothing half-written).
- Rollback to mock: set `PUBLIC_API_MODE=mock` in `.env`, then
  `docker compose up -d --force-recreate app` (the client returns to the
  deterministic generator; the DB is untouched).

### Systemd runtime (alternative, no Docker)

Service (`deno task start` reads `.env`):

```ini
# /etc/systemd/system/barrier-monitor.service
[Unit]
Description=Barrier Monitor (Fresh)
After=network.target postgresql.service

[Service]
User=barreiras
WorkingDirectory=/opt/barrier-monitor
EnvironmentFile=/opt/barrier-monitor/.env
ExecStart=/home/barreiras/.deno/bin/deno task start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Scheduling (continuous sync + alert digest; logs in the journal):

- `scripts/fracttal-poll.ts` runs as its own service (same template as above,
  `ExecStart=... deno run -A scripts/fracttal-poll.ts` with
  `FRACTTAL_SYNC_SCOPES` in the EnvironmentFile).
- Digest: `*/15 * * * *` →
  `deno run -A scripts/alerts-check.ts --apply >> /var/log/alerts.log 2>&1`
  (dry-run without `--apply`; `--reprocess` manual only, after reading the log).
- A relay failure never loses an event: it tries 3 times, stamps
  `attempts`/`last_error` on the payload, and parks it (`dead_letter`) after 5
  failing runs; the log names `event <id> <tag>` for retry via `--reprocess`.

Post-deploy smoke (acceptance):

```
curl -s -o /dev/null -w "root=%{http_code}\n" "$BASE/"
curl -s "$BASE/api/health"  # {"ok":true,"time":"..."}
```

Backup/restore (verified: `pg_dump -Fc` → restore into an empty DB with the
same `barriers` and `barrier_status_history` counts):

```
pg_dump "$DATABASE_URL" -Fc -f barreiras.dump
createdb -O monitor barreiras_restore
pg_restore -d "$RESTORE_URL" barreiras.dump
```

Rollback to mock (without touching the DB): `PUBLIC_API_MODE=mock` (the client
returns to the deterministic generator; the `/api/*` routes still require
`DATABASE_URL`, but nothing calls them). Total rollback: previous build +
mock mode.

## Production cutover (P3, first pass)

Strict order - each step depends on the previous one being green:

1. **Backup**: `pg_dump "$DATABASE_URL" -Fc -f barreiras-pre-cutover.dump`
   (restorable via `pg_restore`; counts checked in the Operations section).
2. **Migrate against the backup, never directly**: start an empty DB from the
   dump, run `deno task db:migrate`, verify `barriers`/`lookups`/`sync_state`/`alert_events`/`alert_recipients` are present; only then migrate prod.
3. **Dual-run mock-vs-http**: with the DB migrated + seeded, compare the
   dashboard totals in both modes (same filters):
   - mock: `PUBLIC_API_MODE=mock` → record KPI total, non-compliant count, grid rows;
   - http: `PUBLIC_API_MODE=http` + `DATABASE_URL` → the same numbers must
     reconcile with the seed (mock is deterministic, seed is fixed - any
     divergence beyond expected is stop-ship);
   - `GET /api/export?format=csv` with full filters: total data rows ==
     `X-Export-Total` == total from the `/api/barriers` route.
4. **Cutover checklist**: clean sync dry-run on the fixture
   (`scripts/fracttal-sync.ts`, without `--apply`); `ADMIN_TOKEN` + `OPS_SMTP_*`
   configured; an active recipient registered; `alerts-check.ts` dry-run
   green; smoke `/` + `/api/health` on the prod build.
5. **Switch on**: systemd service + poll + digest cron (see the Operations
   section); first sync `--apply` in a reviewed session (P3: production is
   read-only until this point).
