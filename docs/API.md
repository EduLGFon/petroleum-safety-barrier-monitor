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
// Location (installation - sheet-real GERAL scope)
LOCATION_CODES = {
  0: "ALL",
  1: "FAL",
  2: "SML",
  3: "FSR",
  4: "IBU",
  5: "FSL",
  6: "CNC",
  7: "JCT",
  8: "FSJ",
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

// Criticality (ranked ESO > A > B > C > D; ESO and A are the critical tiers
// driving criticalNonCompliant counts and alert urgency)
CRITICALITY_CODES = { 0: "ESO", 1: "A", 2: "B", 3: "C", 4: "D" };

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
only the known statuses). Admin snapshots also carry `inactive`/`deleted`
counts over the same filter subset ignoring `rowScope` (absent reads as 0);
they feed the band's Situacao segments and are never computed for other
roles, so hidden rows stay invisible there.

`WireCategoryCompliance` carries `{ categoryId, compliant, total }`;
`resolveChartData` derives `Não Conforme = max(0, total - compliant)`
(fail-closed, same as `computeChartData`); names stay full (the 26-char
shortening is presentation-only in `ChartRow`, so chart rows can filter the
table by exact category).

## Using the real API (Postgres)

The handlers `httpAdapterFactory` expects (barriers, `:id`, kpi, chart) plus
the write/admin/export ones are already implemented in `routes/api/`, on
PostgreSQL (no ORM - pure SQL via `jsr:@db/postgres`, values bound as `$1/$2`).
Full inventory (35 method+path combos): `GET /api/health`, `GET /api/barriers`,
`GET /api/barriers/deleted`, `GET /api/barriers/:id`, `PATCH /api/barriers/:id`,
`PATCH /api/barriers/:id/status`, `GET /api/barriers/:id/sync-detail`,
`GET|POST /api/export`, `GET /api/kpi`, `GET /api/chart`,
`GET /api/vocabularies`, `GET /api/lookups`, `GET|PUT /api/field-options`,
`GET /api/sync-status`, `GET /api/sync-runs`, `GET /api/sync-changes`,
`GET|POST /api/users`, `PATCH|DELETE /api/users/:id`,
`GET|POST /api/recipients`, `PATCH|DELETE /api/recipients/:id`,
`GET|POST /api/alert-rules`, `PATCH|DELETE /api/alert-rules/:id`,
`GET /api/alert-rules/preview`, `POST /api/auth/login`,
`POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`
(`_params.ts` is only parsers and `validation_test.ts` is only tests -
both never routes, `_` prefix / no handler):

- `GET /api/barriers?locationId=1&availabilityId=4&complianceId=1&categoryId=2&typologyId=0&criticalityId=1&criticalOnly=true&hasActionPlan=false&rowScope=active&query=FAL&since=2024-01-01&until=2024-12-31&page=1&pageSize=25&sortCol=statusSince&sortDir=desc` →
  `200 BarriersResponse { items: WireBarrier[], total, page, pageSize, totalPages }` (+ `ETag`, `304` on revalidate)
  - `locationId` omitted/`0` = all; `query` matches `tag ILIKE %q% OR loc.code`
    (`\%_` escaped, capped at 200 chars); `typologyId` filters the Tipologia
    column; `criticalOnly=true` restricts to ESO/A ranks (absent/false = all
    ranks); `hasActionPlan=true/false` filters plan presence; `since`/`until` = `YYYY-MM-DD` over
    `status_since`; `rowScope` = `active` (default: enabled live rows),
    `inactive` (upstream-disabled), `deleted` or `all` (both admin-only,
    non-admins get `403`); `page` default 1 (floor, min 1); `pageSize` default 25
    (clamped `1..100000`); `sortCol` whitelist
    (`id/tag/location/typology/criticality/category/owner/availability/compliance/statusSince`,
    default `id`); strict parsers in `routes/api/_params.ts` (malformed values
    fall back to undefined, never `400`); `{ error, code,
    requestId }` envelope on DB failure (see the P4 section below).
- `GET /api/barriers/:id` → `200 WireBarrier` (`400` invalid id, `404` missing).
  Admins see soft-deleted rows (`includeDeleted: true`), others live-only.
- `PATCH /api/barriers/:id/status` with
  `{ statusId: int >= 0, authorId?: int >= 0, note?: string (cap 2000) }` →
  `200` updated `WireBarrier` via `record_status_change()` (`400` invalid body,
  `404` missing; same-status write returns `200` existing with no history row
  and no alert fan-out). Requires admin (session cookie or
  `Authorization: Bearer <ADMIN_TOKEN>`). Session admins may omit
  `authorId` (derived from their user via `authors`); token callers must
  send it. `401` with dead credentials, `404` camouflage without any
  credential, `403` for authenticated non-admins - writes are never allowed
  by omission. After the commit the
  route runs the hybrid immediate fan-out: matches always enqueue in
  `alert_events`, and winning rules with `notify_immediate` send at once
  (`[Imediato]` subject, single attempt, 10s budget) when the SMTP relay
  is configured - otherwise the digest cron sends. Fan-out failures only
  log; the response stays the updated `WireBarrier`.
- `GET|POST /api/export?format=csv|xlsx|pdf` (+ the same filters as
  `/api/barriers`) → the whole scope as CSV, `.xlsx` workbook or real PDF
  bytes (CSV with BOM and 30-column header plus a `RESUMO` block; the
  workbook is real OOXML with the brand block, KPI strip, frozen header,
  autofilter and a `Resumo` sheet; the PDF is a hand-written A4-landscape
  document with the brand block, KPI chips, all 30 columns, a repeated header
  and a footer - byte-identical cell mapping to the dashboard exports:
  `row()` + `csvCell()`/`row()` + `summaryRowsFrom()`). Rows stream
  from the database in 5,000-row batches (`ReadableStream`, so nothing is
  buffered whole), ceiling `EXPORT_MAX_ROWS` = 200,000 rows (`400` naming the
  real total when exceeded - refine the filters), `Content-Disposition:
  attachment`, `X-Export-Total` with the scope total. The workbook streams
  straight out of the ZIP writer and the PDF straight out of the page writer,
  so a 200k-row export never materialises in
  memory. `format=xls` and `format=html` are still accepted as legacy aliases
  of `xlsx` and `pdf`. `POST`
  takes a JSON body `{ format?, ids?, timeZone? }`: `ids` narrows the export to
  the selected rows (still intersected with the filters, so a stale selection
  cannot widen the scope; positive safe ints only, deduped, capped at
  200,000 - empty/malformed means the whole scope); `timeZone` resolves via
  `resolveTimeZone` for the report header. Body `format` wins over
  `?format=`; default `csv`. Unknown `format` answers
  `400 format must be csv, xlsx or pdf`.
- `GET /api/barriers/deleted` (+ the same filters, minus `typologyId`,
  `criticalOnly`, `rowScope` - forced `rowScope: "deleted"`) → `200 BarriersResponse`
  with only deleted rows (soft-delete sync audit, legacy alias for
  `GET /api/barriers?rowScope=deleted`). Requires
  admin (session admin or `Bearer <ADMIN_TOKEN>`; non-admin session → `403`,
  no credential → `404`, dead credential → `401`); the `/api/barriers/:id` detail returns deleted rows to
  admins and keeps hiding them from everyone else. `WireBarrier` carries
  `isActive` (false = Desativada) and `deletedAt` (null = live) so the
  dashboard Situacao filter badges rows without a second lookup.
- `GET /api/kpi?locationId=1&availabilityId=4&...` → `200 WireKpiSnapshot`
  over the same filter subset as the table (location, availability,
  compliance, category, typology, criticality, criticalOnly, action-plan
  presence, text, dates, rowScope; omitted = all). Admins additionally get
  `inactive`/`deleted` scope counts over the same subset ignoring `rowScope`;
  other roles get scope-local numbers only. `rowScope=deleted|all` by a
  non-admin answers `403`.
- `GET /api/chart?...` (same filter subset) → `200 WireCategoryCompliance[]`
  (`{ categoryId, compliant, total }[]`; non-compliant derives as
  `total - compliant`). Same `403` rule on admin-only scopes.
- `GET /api/vocabularies` → `200 Vocabularies` (`locations: [{ id, code, name, count }]`,
  `availabilities/compliances/criticalities: string[]`,
  `categories/typologies: [{ id, label }]`, `authors?: [{ id, name }]` -
  id-bearing locations + categories for the refresh cadence; SSR still seeds the first paint)
- `GET /api/sync-status` → `200 SyncStatus` (`state` syncing/idle/stale/unknown,
  `runningSince`, last finished run with counts + note, tracked barrier
  total) for the dashboard indicator; polls every minute (15s fast lane
  while a run is in flight)
- `GET /api/sync-changes?scope=last-run|last-day&runId=&kind=new|updated|removed|restored|all&query=&page=1&pageSize=25` →
  `200 { run: SyncRun | null, items: SyncChangeItem[], total, page, pageSize, totalPages, summary: { total, byKind, byStatus, critical } }`
  (paged per-barrier list with `oldStatus`, `changedFields`, `runId`; summary
  reconciles by kind/status/critical for the tab header). `runId` overrides
  `scope`; non-positive/NaN `runId` means unpinned. `query` (alias `q`, tag
  substring, capped 200 chars) filters. `page` clamps `1..100000` (default 1),
  `pageSize` clamps `1..100` (default 25). Unknown `scope` falls back to the
  24h window; malformed values never `400`, they use defaults. Legacy `?limit=8`
  alone still returns `200 { changes: SyncChange[] }` (`{ barrierId, tag, location, kind, status, changedAt }[]`,
  page 1, `pageSize = limit` clamped `1..100` default 8) for the old hover card.
- `GET /api/sync-runs?limit=10` → `200 { runs: SyncRun[] }` (recent finished
  runs, newest first, for the run picker; `limit` clamps `1..50`, default 10,
  malformed URL falls back to 10).
- `GET /api/barriers/:id/sync-detail?runId=&scope=last-day` →
  `200 { detail: SyncBarrierDetail }` (`{ barrierId, tag, location,
  kind: new|updated|removed|restored, oldAvailabilityId, newAvailabilityId,
  changedFields, oldSnapshot, newSnapshot, changedAt, runId }` -
  before/after snapshots + changed fields
  for one barrier; loaded only when a row expands). `runId` pins a run;
  `scope=last-day` uses the rolling 24h window; absent both uses the latest
  change. `400` invalid id, `404` no sync change found.
- `GET /api/health` → `200 { ok: true, time: ISO }` (liveness, no DB, no auth, no throttle)
- `GET /api/recipients` (+ `?activeOnly=1`) → `200 AlertRecipient[]`,
  `POST /api/recipients`
  `{ email, name? }` (upsert by email - revives/renames on conflict, `201 AlertRecipient { id, email, name, active, created_at }`),
  `PATCH /api/recipients/:id`
  `{ name?, active?: boolean }` (`400` empty patch / bad types, `404` missing),
  `DELETE /api/recipients/:id` → `200 { ok: true }` (`404` missing) -
  all require admin (session or `Bearer <ADMIN_TOKEN>`, including GET:
  addresses are admin data). Email normalizes (trim/lower/slice-254 +
  `user@host.tld` check); name trims to 200 chars, default `""`.
- `POST /api/auth/login` `{ email, password }` → `200 PublicUser { id, email, name, role, active, created_at }` + HttpOnly
  session cookie (`barrier_session`, 12h, `SameSite=Lax`, `Secure` on https;
  write throttle; `400` invalid JSON / missing fields / bad email, `401` generic
  on bad credentials - wrong email, inactive user, or bad hash all read the same
  so accounts cannot be enumerated); `GET /api/auth/me` →
  `200 SessionUser { id, email, name, role, active }` (read throttle; session cookie
  only - `ADMIN_TOKEN` alone does not satisfy; `401` without one, `503` when the
  auth store is down); `POST /api/auth/logout` →
  `200 { ok: true }` + cleared cookie (write throttle; missing cookie still succeeds);
  `POST /api/auth/password`
  `{ currentPassword, newPassword }` → `200 { ok: true }` + cleared cookie -
  self-service change for any active session (admin or user; `ADMIN_TOKEN`
  rejected, identity comes from the session alone so no user can address
  another's password). Requires the current password, enforces the 12-256
  policy, rejects reuse (`400 new password must differ`), revokes every session
  (re-login everywhere). `401` on wrong current password. Password throttle
  (10/min); `ADMIN_TOKEN` callers get `401 session required`.
- `GET /api/users` → `200 PublicUser[]` (no hashes, `order by id`),
  `POST /api/users` `{ email, name?, password (12-256), role?: admin|user (default user) }`
  (`201 PublicUser`) - both require admin; the first account is provisioned
  via CLI (`scripts/create-admin.ts`), never via this route. `PATCH
  /api/users/:id` `{ name?, role?, active?: boolean, password? }` (`200 PublicUser`,
  `400` empty patch / bad types / last-admin violation; a password change revokes
  all of that user's sessions), `DELETE
  /api/users/:id` → `200 { ok: true }` (`404` missing) - the last active admin cannot be
  demoted, deactivated, or deleted (`400`).
- `GET /api/alert-rules` (+ `?activeOnly=1`) → `200 AlertRule[]`,
  `POST /api/alert-rules` (`201 AlertRule`) with
  `{ name: required trim<=200 non-empty, description?: trim<=2000 (default ""),
  categoryId?: int>=0|null (default null = all), toStatusId?: int>=0|null,
  criticalOnly?, includeRecovery?, notifyImmediate?, active? (booleans; defaults false,false,false,true),
  staleDays?: positive int|null, categoryIds?, fromStatusIds?, toStatusIds?,
  locationIds?, criticalityIds?, typologyIds?, groupingIds?, ownerIds? (int[] deduped sorted, empty/null = all),
  urgency?: any|urgent|critical (default any), onlyNoActionPlan? (default false),
  onTransition? (default true), cooldownMinutes?, maxPerDay?, staleRepeatDays? (positive int|null),
  quietStartHour?, quietEndHour? (0..23|null), activeDays? (int[] 0..6),
  priority?: int -1000..1000 (default 0), validFrom?, validTo? (YYYY-MM-DD|null) }`,
  `PATCH /api/alert-rules/:id` (same fields, all optional/partial; `400` on
  empty patch, `404` missing), `DELETE /api/alert-rules/:id` → `200 { ok: true }`
  (`404` missing) - all require admin. Duplicate names answer `400`.
  `categoryId: null` (and empty id lists) means all categories; no active
  rule covering a category mutes it.
- `GET /api/alert-rules/preview?categoryIds=1,2&locationIds=3&criticalityIds=&typologyIds=&groupingIds=&ownerIds=&staleDays=7&onlyNoActionPlan=1` →
  `200 { count: number, tags: string[<=5] }` (dry-run count over live rows for a
  rule draft; `categoryIds/locationIds/...` are CSV `int>=0[]`, empty/malformed
  means all; `staleDays` adds `compliance=NC AND status_since <= today - days`,
  `400` unless a positive int; `onlyNoActionPlan=1` adds an empty-plan gate).
  Admin only; read throttle. Note: Fresh routes static `preview.ts` before
  `[id].ts`, so `/preview` never parses as an id.
- `GET /api/lookups` → `200 { availabilities: [{ id, label }],
  categories: [{ id, label }], locations: [{ id, code, name }],
  criticalities/typologies/groupings/owners: [{ id, label }],
  authors: [{ id, name }] }` - requires any authenticated caller (session
  or token; anonymous → `404`, dead credential → `401`); feeds the admin forms.
- `GET /api/field-options` → `200 FieldOptionSet[] { field, options, updated_at, updated_by }`
  (any data reader - session of either role or token; missing rows seed from the GERAL extraction);
  `PUT /api/field-options?field=<key>` `{ options: string[] }` (`200` updated set, admin only;
  `field` must be one of `origin|installLocal|equipTypology|category|evidenceCode|outOfService|fieldInstalled|fieldOperational|opStatus|hasMaintPlan|planFollowed|failureFree|maintStatus|hasContingency`,
  else `400 Unknown field`; `options` trims/collapses-space/slices-200, drops
  empty/dupes, caps 200, non-empty else `400`)
  - curated answer lists for the barrier sheet questions.
- `PATCH /api/barriers/:id` (`200` updated `WireBarrier`, admin only) - partial update of editable core
  and sheet fields (`tag` cap 200, `locationId`, `typologyId`, `categoryId`,
  `groupingId`, `ownerId` (null allowed), `criticalityId`, `comments`, `actionPlan`, plus
  the 15 sheet columns `origin|installLocal|equipTypology|fieldInstalled|fieldOperational|opStatus|hasMaintPlan|planFollowed|failureFree|maintStatus|hasContingency|contingencyDesc|evidenceCode|degradationDesc|extraComments`
  caps 200/2000; all optional; strings must be strings, ints non-negative ints,
  else `400`); `availabilityId` routes through
  `record_status_change()` (with `statusNote?`, default `"Edição de barreira"`)
  so history and alerts keep working, plus the same best-effort immediate
  fan-out as the status route (never fails the response). Compliance
  and `statusSince` are never writable. `404` when the barrier is missing.

## Errors, auth, and throttle (P4)

Every failure responds with the `{ error, code, requestId }` envelope + the
`x-request-id` header (`code`: `BAD_REQUEST` / `NOT_FOUND` / `UNAUTHORIZED` /
`FORBIDDEN` / `RATE_LIMITED` / `UNAVAILABLE` / `INTERNAL`; `500` never leaks
a stack or column - the public message is fixed per route and the detail goes
to the log with the `requestId`). Every JSON success also carries
`x-request-id` (`ok()` / `created()` in `lib/server/errors.ts`), so a client
report always correlates with a server log line. Every GET JSON success
additionally carries an `ETag` (SHA-256 over the exact response bytes) plus
`Cache-Control: private, no-cache`, and answers `304` with no body when
`If-None-Match` matches (`okWithEtag()` in `lib/server/errors.ts`) - shared
caches never store authenticated bodies, and clients that revalidate skip
re-downloading unchanged polls. The HTTP adapter (`lib/api/http.ts`)
revalidates per URL from a bounded per-adapter memory cache and serves
`304` answers from memory, so steady-state polls cost a header round-trip
instead of full JSON bodies. The pipeline order is fixed
everywhere: throttle -> `loadServerConfig` -> auth -> validation -> DB.

Login => Dashboard: **dashboard GETs require auth** (`barriers`, `:id`,
`:id/sync-detail`, `kpi`, `chart`, `export`, `vocabularies`, `sync-status`,
`sync-runs`, `sync-changes`, `field-options` GET) - session cookie
or `ADMIN_TOKEN`. Anonymous callers get `404` camouflage (`NOT_FOUND`, same
shape as a missing route); dead credentials get `401`. A throwing session
store (DB blip) answers `503 UNAVAILABLE` + `Retry-After`, never `401`, so
the dashboard backs off instead of dropping the user to login.
**Writes and admin data require admin** (admin session cookie or `ADMIN_TOKEN`):
`PATCH .../status`, `PATCH .../:id`, `PUT .../field-options`, recipients,
users, alert-rules (including `preview`), `GET /api/barriers/deleted`.
`GET /api/lookups` and `POST /api/auth/password` require any authenticated
caller (session or token), with password additionally requiring the session
path (`ADMIN_TOKEN` alone gets `401 session required`).
An authenticated non-admin on an admin-only scope gets `403 FORBIDDEN`
(`admin only`), never `401`, so clients show "restricted" instead of
redirecting to login in a loop.
Pages: `/login` is the only public route - `/` redirects logged-out
sessions to `/login?next=`. Admin management lives in the settings
sidepanel Admin tab (admin role only); the admin APIs below stay
server-enforced regardless of what the drawer shows.

In-memory throttle by remote IP (never `X-Forwarded-For`, which is forgeable):
120 req/min on reads, 30 req/min on writes, 120 req/min on export, 10 req/min
on self-service password changes
(`429 { error, code: RATE_LIMITED }` + `Retry-After`). `/api/health` is not
throttled (liveness probe - the only unthrottled route). The export additionally shares its budget across
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
`pageSize: 100000`. Every export format streams the full filtered set from
`GET /api/export` (200k ceiling); detail resolves from the current page.

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

| File                                      | Responsibility                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lib/api.ts`                              | Barrel: picks mock vs HTTP via `PUBLIC_API_MODE`, re-exports `toWireQuery` + `mockApi`                        |
| `lib/api/types.ts`                        | `BarriersApi` (5 methods) + `DomainQuery` (string filters)                                                    |
| `lib/api/query.ts`                        | `toWireQuery`, `cleanDateParam`, `buildQueryString`                                                           |
| `lib/api/mock.ts`                         | `mockAdapter`: numeric `matchesQuery` + `sortWire`, resolves only the final page                              |
| `lib/api/http.ts`                         | `httpAdapterFactory(baseUrl)`: fetch over `routes/api/*`; `null` only on 404                                  |
| `lib/enums.ts`                            | Barrel over `lib/enums/`                                                                                      |
| `lib/enums/codes.ts`                      | `LOCATION/AVAILABILITY/COMPLIANCE/CRITICALITY` + `to/fromXId`                                                 |
| `lib/enums/taxonomy.ts`                   | `CATEGORY/GROUPING/TYPOLOGY/OWNER` (`ownerId -1` = empty)                                                     |
| `lib/enums/context.ts`                    | `LOC_DESC/AUTHOR` (from* only)                                                                                |
| `lib/wireTypes.ts`                        | Wire format (numeric ids; no `complianceId` in `WireBarrier`)                                                 |
| `lib/types.ts`                            | UI domain (resolved strings, open unions, `Vocabularies`)                                                     |
| `lib/resolve.ts`                          | `resolveBarrier(s)`, `resolveHistoryEntry`, `resolveKpi`, `resolveChartData`                                  |
| `lib/data.ts`                             | Barrel over `lib/mock/` (deterministic generator)                                                             |
| `lib/mock/generator.ts`                   | `getWireBarriers()` cached (`0xdeadbeef`, status/station distributions)                                       |
| `lib/mock/history.ts`                     | `generateHistory` + comments/plans/notes per status                                                           |
| `lib/mock/tags.ts`                        | `buildTag` + prefixes per category                                                                            |
| `lib/mock/rng.ts`                         | PRNG with seed (`next/int/pick/bool`)                                                                         |
| `lib/constants.ts`                        | Barrel over `lib/constants/`                                                                                  |
| `lib/constants/locations.ts`              | `LOCATIONS`, `LOCATION_DIST_BY_ID`, `SIM_DATE`, `PAGE_SIZE(_OPTS)`                                            |
| `lib/constants/catalog.ts`                | Seed lists (categories, groupings, typologies, owners, locs, authors)                                         |
| `lib/constants/helpers.ts`                | `isCompliant()` + `distinctBy()`                                                                              |
| `lib/constants/colors.ts`                 | Colors per status + `DISP_KNOWN_ORDER`, `shortStatusLabel`                                                    |
| `lib/server/db.ts`                        | Lazy server-only Postgres pool (`globalThis.__barrierPool`)                                                   |
| `lib/server/sql/barriers.ts`              | `listBarriers`, `listBarrierWindow` (export paging), `getBarrierById`, `getKpi`, `transitionBarrierStatus`    |
| `lib/server/sql/chart.ts`                 | `getChartData` (`GROUP BY category_id`)                                                                       |
| `lib/server/sql/vocabularies.ts`          | `getVocabularies()` (SSR seed + `GET /api/vocabularies` refresh)                                              |
| `lib/server/sql/where.ts`                 | `buildWhere`, `resolveOrderBy` (whitelist), `escapeLike`                                                      |
| `lib/server/sql/mappers.ts`               | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`                                        |
| `routes/api/_params.ts`                   | Strict parsers (`parseInt/parseDate/parseQueryParam`); never a route (`_` prefix)                             |
| `routes/api/barriers.ts`                  | `GET /api/barriers` (session/token, read throttle)                                                            |
| `routes/api/barriers/deleted.ts`          | `GET /api/barriers/deleted` (deleted only, admin session or token)                                            |
| `routes/api/barriers/[id].ts`             | `GET/PATCH /api/barriers/:id` (GET any reader, PATCH admin field update)                                      |
| `routes/api/barriers/[id]/status.ts`      | `PATCH /api/barriers/:id/status` (requires admin, write throttle; author derives from session)                |
| `routes/api/barriers/[id]/sync-detail.ts` | `GET /api/barriers/:id/sync-detail` (session/token, read throttle; pinned run or 24h window)                  |
| `routes/api/export.ts`                    | `GET/POST /api/export` (csv/xlsx/pdf; session/token, export throttle, streamed, selection via `ids`)          |
| `routes/api/kpi.ts`                       | `GET /api/kpi` (session/token, read throttle)                                                                 |
| `routes/api/chart.ts`                     | `GET /api/chart` (session/token, read throttle)                                                               |
| `routes/api/sync-status.ts`               | `GET /api/sync-status` (session/token, read throttle; dashboard indicator)                                    |
| `routes/api/sync-runs.ts`                 | `GET /api/sync-runs` (session/token, read throttle; `?limit=` 1..50)                                          |
| `routes/api/sync-changes.ts`              | `GET /api/sync-changes` (session/token, read throttle; paged + legacy `?limit=` shape)                        |
| `routes/api/vocabularies.ts`              | `GET /api/vocabularies` (session/token, read throttle; refresh cadence)                                       |
| `routes/api/health.ts`                    | `GET /api/health` (liveness, no DB, no auth, no throttle)                                                     |
| `routes/api/recipients.ts`                | `GET/POST /api/recipients` (admin, upsert by email)                                                           |
| `routes/api/recipients/[id].ts`           | `PATCH/DELETE /api/recipients/:id` (admin)                                                                    |
| `routes/api/auth/login.ts`                | `POST /api/auth/login` (credentials → session cookie)                                                         |
| `routes/api/auth/logout.ts`               | `POST /api/auth/logout` (revoke + clear cookie)                                                               |
| `routes/api/auth/me.ts`                   | `GET /api/auth/me` (session user for islands)                                                                 |
| `routes/api/auth/password.ts`             | `POST /api/auth/password` (own password change, session-only)                                                 |
| `routes/api/users.ts`                     | `GET/POST /api/users` (admin only; first account via CLI)                                                     |
| `routes/api/users/[id].ts`                | `PATCH/DELETE /api/users/:id` (admin, last-admin guard)                                                       |
| `routes/api/alert-rules.ts`               | `GET/POST /api/alert-rules` (admin, scoped triggers + anti-noise windows)                                     |
| `routes/api/alert-rules/[id].ts`          | `PATCH/DELETE /api/alert-rules/:id` (admin)                                                                   |
| `routes/api/alert-rules/preview.ts`       | `GET /api/alert-rules/preview` (admin dry-run count + sample tags)                                            |
| `routes/api/lookups.ts`                   | `GET /api/lookups` (authenticated id lists for admin forms)                                                   |
| `routes/api/field-options.ts`             | `GET/PUT /api/field-options` (GET any reader, PUT admin only)                                                 |
| `lib/server/sql/field-options.ts`         | `field_option_sets` store + GERAL seed defaults                                                               |
| `lib/server/sql/barriers.ts`              | `updateBarrier` (metadata + sheet fields; status via transition)                                              |
| `lib/field-options.ts`                    | Field registry, pt-BR labels, seed defaults, option validation                                                |
| `islands/BarrierEditor.tsx`               | Admin barrier edit form (modal Editar tab)                                                                    |
| `lib/server/config.ts`                    | `loadServerConfig` (http boot), `loadSyncConfig` (Fracttal credentials for scripts)                           |
| `lib/server/errors.ts`                    | Envelope `{ error, code, requestId }` + `x-request-id`                                                        |
| `lib/server/auth.ts`                      | `checkAdminAuth` (Bearer) + `resolveRequestAuth`/`requireAdminAuth`/`requireAuthenticated` (session or token) |
| `lib/server/throttle.ts`                  | `createThrottle` (fixed window, no deps) + per-route buckets                                                  |
| `lib/server/sql/throttle.ts`              | Postgres `throttle_buckets` budget shared across isolates (memory fallback)                                   |
| `lib/server/exportRows.ts`                | `resolveExportScope` (scope KPI) + `exportBatches` (5,000-row paged batches)                                  |
| `lib/server/exportStream.ts`              | `textStream` (head / batch / tail skeleton shared by the CSV format)                                          |
| `lib/server/exportCsv.ts`                 | `streamExportCsv` (BOM + `row()` + `summaryRowsFrom()`)                                                       |
| `lib/server/exportXlsx.ts`                | `streamExportXlsx` (workbook streamed out of the ZIP writer, batch by batch)                                  |
| `lib/server/exportPdf.ts`                 | `streamExportPdf` (report streamed page by page, batch by batch)                                              |
| `lib/server/sql/recipients.ts`            | CRUD `alert_recipients` (pure validation + thin store)                                                        |
| `lib/server/sql/users.ts`                 | CRUD `users` (roles, last-admin guard, no hashes in JSON)                                                     |
| `lib/server/sql/sessions.ts`              | Opaque `sessions` (hash lookup, revoke, expiry sweep)                                                         |
| `lib/server/sql/authors.ts`               | `listAuthors` + `getOrCreateAuthor` (session → author id)                                                     |
| `lib/server/sql/alert_rules.ts`           | CRUD `alert_rules` + `listStaleBarriers` (time trigger)                                                       |
| `lib/server/auth/password.ts`             | PBKDF2-SHA256 hash/verify + 12-char policy (WebCrypto only)                                                   |
| `lib/server/auth/session.ts`              | Opaque token, SHA-256 hash, HttpOnly cookie builders                                                          |
| `lib/server/alerts/store.ts`              | `AlertStore` contract (dedup, `delivered[]` per recipient)                                                    |
| `lib/server/alerts/rules.ts`              | Pure rule matching (category scope, critical, recovery, immediacy)                                            |
| `lib/server/alerts/detect.ts`             | `detectUrgentTransitions` (history → rules, legacy fallback)                                                  |
| `lib/server/alerts/immediate.ts`          | `maybeSendImmediate` (PATCH fan-out: enqueue always, at-once send on immediate rules)                         |
| `lib/server/alerts/run.ts`                | `runAlertCycle` (detect→stale→enqueue→digest→mark, dry-run default, `--reprocess`)                            |
| `lib/server/alerts/mailer.ts`             | `AlertMailer` + SMTP provider (P3 reuse) + `sendWithRetry`                                                    |
| `lib/server/alerts/templates.ts`          | Urgent digest pt-BR (subject counts criticals, body lists criticals first)                                    |
| `lib/server/sql/alerts.ts`                | `sqlAlertStore` (`ON CONFLICT dedup_key DO NOTHING`, dead-letter in payload)                                  |
| `lib/dashboard/urgent.ts`                 | `urgencyOf`/`isUrgent`/`compareUrgency`/`urgentBarriers` (fail-closed baseline = NcAlert)                     |
| `islands/dashboard/vocabularies.ts`       | Client hook `useDashboardVocabularies` (mock mode only)                                                       |
| `db/schema.sql`                           | DDL: lookup tables, `barriers`, `barrier_status_history`                                                      |
| `db/seed_lookups.sql`                     | Seeds the static lookups, mirroring `lib/enums/`                                                              |

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

### Systemd runtime (alternative, no Docker; Windows Server: `docs/DEPLOY-WINDOWS.md`)

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
