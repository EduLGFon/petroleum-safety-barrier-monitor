# Architecture - Safety Barrier Monitor

Single source of truth for modules, data flows, runtime lifecycle, island
bridge topology, persistence, and config. Read this before any architectural
change (see `agents.md` documentation rules).

Stack: Deno-only Fresh 2 + Vite + Preact islands. No ORM, no `package.json`.

## Runtime lifecycle

`main.ts` boots one `App<State>` (`utils.ts` `define`) with `staticFiles()`
plus `fsRoutes()`. `client.ts` only imports `static/styles.css` for HMR.
`vite.config.ts` enables `@fresh/plugin-vite`.

| Task                                                  | Command                                                                                                                                                                                                                | Env source                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `check`                                               | `deno fmt --check . && deno lint . && deno check main.ts routes/api/*.ts routes/api/*/*.ts routes/api/*/*/*.ts scripts/*.ts`                                                                                           | none                                                        |
| `test`                                                | `deno test --allow-read=scripts/fixtures --allow-net=127.0.0.1,localhost --allow-env=OPS_SMTP_HOST,OPS_SMTP_PORT,OPS_SMTP_USER,OPS_SMTP_PASS,OPS_EMAIL_TO,OPS_EMAIL_FROM,MAIL_HOST,MAIL_USER,MAIL_PASS,DATABASE_URL .` | shell + `DATABASE_URL` (integration gated)                  |
| `dev`                                                 | `vite`                                                                                                                                                                                                                 | shell only, no `--env-file`; `export $(cat .env \| xargs)`  |
| `build`                                               | `vite build`                                                                                                                                                                                                           | shell at build time; request-time env still needed at serve |
| `preview`                                             | `deno serve -A _fresh/server.js`                                                                                                                                                                                       | shell only, no `--env-file`                                 |
| `start`                                               | `deno serve --env-file=.env -A _fresh/server.js`                                                                                                                                                                       | `.env`                                                      |
| `db:migrate`                                          | `deno run -A --env-file=.env scripts/migrate.ts`                                                                                                                                                                       | `.env` (`DATABASE_URL`)                                     |
| `db:seed`                                             | `deno run -A --env-file=.env scripts/seed.ts`                                                                                                                                                                          | `.env` (`DATABASE_URL`)                                     |
| `fracttal:import`                                     | `deno run -A --env-file=.env scripts/fracttal-import.ts`                                                                                                                                                               | `.env` (`DATABASE_URL`)                                     |
| `fracttal:sync`                                       | `deno run -A --env-file=.env scripts/fracttal-sync.ts`                                                                                                                                                                 | `.env` (`DATABASE_URL` + `FRACTTAL_*` live)                 |
| `fracttal:force-sync`                                 | `deno run -A --env-file=.env scripts/fracttal-force-sync.ts`                                                                                                                                                           | `.env` (`DATABASE_URL` + `FRACTTAL_*` live)                 |
| `browser:capture`                                     | `deno run -A scripts/browser-capture.ts [url] [out] [--mode shot\|pdf]`                                                                                                                                                | none                                                        |
| `docker:build` / `:up` / `:down` / `:logs`            | `docker compose build` / `up -d --build` / `down` / `logs -f`                                                                                                                                                          | `.env`                                                      |
| `docker:migrate` / `:audit` / `:sync` / `:force-sync` | `docker compose run --rm tools ...` wrappers around `migrate` / `audit` / `sync --live` / `force-sync`                                                                                                                 | `.env`                                                      |
| `docker:dev` / `:dev-down`                            | `docker compose -f compose.yml -f compose.dev.yml up --build` / `down` (bind mounts: vite HMR on :5173, `--watch` loops, no rebuild per edit)                                                                          | `.env`                                                      |
| `fracttal:audit`                                      | `deno run -A --env-file=.env scripts/fracttal-audit-stations.ts`                                                                                                                                                       | `.env` (`DATABASE_URL` + `FRACTTAL_*` live)                 |
| `fracttal:poll`                                       | `deno run -A --env-file=.env scripts/fracttal-poll.ts`                                                                                                                                                                 | `.env` (`DATABASE_URL` + `FRACTTAL_*` live)                 |
| `fracttal:capture` / `:extract`                       | read-only live probes                                                                                                                                                                                                  | shell only (`FRACTTAL_*`)                                   |
| `alerts:check`                                        | `deno run -A --env-file=.env scripts/alerts-check.ts`                                                                                                                                                                  | `.env` (`DATABASE_URL` + `OPS_*`)                           |
| `alerts:poll`                                         | `deno run -A --env-file=.env scripts/alerts-poll.ts`                                                                                                                                                                   | `.env` (`DATABASE_URL` + `OPS_*`)                           |
| `admin:create`                                        | `deno run -A --env-file=.env scripts/create-admin.ts`                                                                                                                                                                  | `.env` (`DATABASE_URL`)                                     |

`build` emits `_fresh/server.js` + `_fresh/server/` + `_fresh/client/`.

Helper scripts (also under `scripts/`, correctly placed per workflow rules):
`browser-capture.ts` (`--mode shot|pdf`, replaces the old shot/pdf pair) /
`browser-smoke.ts` (headless Chrome probes), `chaos-scale.ts` (50k-row
dynamic-data contract check), `test-dom.ts` (linkedom harness for hook
tests), `import-sort.ts` (agents.md import-order enforcer).
Removed one-offs: `extract-sheet-options.ts` + `sheet-options.json` and
`inventory-probe.py` (archived, values already baked into seed).
`COMPANY_NAME` is read per request, not baked at build time.
`routes/_app.tsx` renders the HTML shell plus a FOUC guard that restores
theme/accent/density/motion from `barrier-settings` before hydration.

## Layer boundaries

- `routes/` - SSR + HTTP edge only. `_app.tsx` shell, `index.tsx` mode
  switch, `api/*` handlers parse via `_params.ts` and call
  `lib/server/sql/*`. Never render dashboard UI.
- `lib/` - pure/shared logic. No Preact, no `localStorage`. Barrels
  (`lib/api.ts`, `lib/data.ts`, `lib/enums.ts`, `lib/constants.ts`,
  `lib/utils.ts`) re-export split modules underneath.
- `islands/` - only hydrated JS. `islands/Dashboard.tsx` is the single
  island root; `islands/dashboard/` holds the mode switch, sections, and
  server-error UI. May import `components/`, `hooks/`, `context/`, `lib/`
  (non-server). Must never import `lib/server/*`.
- `components/` - static presentational UI, bundled as part of the island
  subtree. Props-driven; vocabularies arrive via props.
- `hooks/dashboard/` + `hooks/useDashboard.ts` + `hooks/useConnection.ts`
  - client state (island-only).
- `context/` - `SettingsContext` + `ThemeContext`, provided inside the
  island root because server route context does not reach hydrated islands.
- `lib/server/` - server-only Postgres pool (`db.ts`) + SQL repositories
  - edge helpers (`errors.ts`, `throttle.ts`, `config.ts`, `page-auth.ts`,
    `exportRows.ts`, `exportStream.ts`, `exportCsv.ts`, `exportXlsx.ts`,
    `exportPdf.ts`).
    Only `routes/index.tsx` and `routes/api/*` may import it.

Server-only boundary is enforced by convention: `lib/server/db.ts` holds a
lazy `Pool` on `globalThis.__barrierPool` (import never throws; first
`queryRows` throws when `DATABASE_URL` is missing). All values are bound as
`$1/$2` via `queryObject`; `ORDER BY` uses the `SORTABLE` whitelist in
`lib/server/sql/where.ts`.

## Data flows

### Mock mode (`PUBLIC_API_MODE=mock`, default)

```
routes/index.tsx --api.getAllBarriers()--> lib/api/mock.ts
  --> lib/mock/generator.ts --> resolveBarriers --> Barrier[]
  --> <Dashboard initialBarriers={full list} apiMode="mock" vocabularies={null}>
  --> DashboardView ClientView --> useDashboard + useDashboardVocabularies
  --> DashboardSections (Header, KpiSections, FilterBar filter row with Colunas + export icon buttons, result count and reset, BarriersTable with switchable columns and header bulk selection)
```

Full list ships as island props. No DB, no `fetch`. Filtering, sorting,
pagination, KPI, and chart all derive client-side from `lib/dashboard/*`.
Export covers the full filtered set.

### HTTP mode (`PUBLIC_API_MODE=http`)

SSR in `routes/index.tsx` calls `getVocabularies()` (7 parallel SQL queries)
and renders `<Dashboard initialBarriers={[]} vocabularies={...}>`. Rows never
cross the island boundary (50k+ scale).

```
DashboardView ServerView --> useServerDashboard(baseUrl)
  --> toWireQuery(domain filters) + httpAdapterFactory(baseUrl)
  --> Promise.all([GET /api/barriers, GET /api/kpi, GET /api/chart])
  --> resolveBarriers/resolveKpi/resolveChartData --> render
```

Table pages use full filters; KPI/chart honor the same filter subset
(minus paging/sort) (`hooks/dashboard/server.ts`, one shared scope builder
in `hooks/dashboard/scope.ts`). Requests cancel on supersede; first load
shows the splash, later refetches keep stale rows. `error + rows == 0`
renders `ServerErrorCard`, otherwise `ServerErrorBanner` with retry. A
5-minute cadence (hidden tabs skip) refreshes data plus vocabularies via
`GET /api/vocabularies`. Every export format goes through
`GET|POST /api/export` over the whole selection (ids in the body, filters
in the query), streamed from the database in batches, so a cross-page
selection of 18k barriers exports completely; only detail resolution is
page-local.

## Export pipeline

`lib/export/` holds one builder per format, all fed the same 30-column
`rows.ts` mapping and the same `columns.ts` order, so the browser and the
server emit identical cells. CSV is text: split into head/row/tail pieces
(`csv.ts`) and driven by `lib/server/exportStream.ts`, which turns paged
batches into a byte stream.
The spreadsheet is a real OOXML workbook: `lib/export/xlsx/` builds the
package - `zip.ts` (streaming ZIP with `deflate-raw` and data descriptors),
`xml.ts`, `styles.ts` (on-demand style registry), `widths.ts`, `parts.ts`
(package plumbing), `dataSheet.ts` (the streamed "Barreiras" sheet) and
`workbook.ts` (the ZIP assembly, shared by `lib/export/xlsx.ts` for the
browser and `lib/server/exportXlsx.ts` for the route).
The PDF is real PDF 1.4 bytes: `lib/export/pdf/` holds `metrics.ts` (base-14
Helvetica advances plus WinAnsi encoding), `columns.ts` (fixed column shares),
`layout.ts` (page geometry and pagination), `writer.ts` (streaming objects,
deflated content streams, trailing xref) and `document.ts` (brand block, KPI
chips, table, footer - shared by `lib/export/pdf.ts` for the browser and
`lib/server/exportPdf.ts` for the route). No PDF library is used at runtime;
only base-14 fonts (never embedded) and FlateDecode streams, which every
reader supports, and no URI or script object is ever emitted, so the file
cannot carry a page URL.
Every format downloads
as one file straight from the database batches - no preview step, so a large
selection cannot freeze the tab. Ceilings come from the
formats themselves (`lib/export/limits.ts`): the export ceiling is 200,000
rows, which sits under Excel's 1,048,576-row worksheet limit, so the workbook
always fits one sheet. The
report table uses fixed column shares that sum to the printable width
(`colGeometry`), so all 30 export columns land on the A4-landscape
page instead of overflowing and being clipped at the paper edge; text wraps
inside each column (long tokens break anywhere) and stays vector-crisp at
any zoom.

## Island bridge topology

Islands cannot read `Deno.env` in the browser. Server config crosses the
boundary as props from `routes/index.tsx`:

- `initialBarriers` (mock mode full list, http mode `[]`)
- `companyName` (`COMPANY_NAME` via `lib/company.ts`)
- `apiMode` (`PUBLIC_API_MODE`, default `mock`)
- `apiBaseUrl` (`PUBLIC_API_BASE_URL`)
- `vocabularies` (`getVocabularies()` in http mode, `null` in mock mode)
- `sessionUser` (authenticated user or `null`, from `routes/index.tsx`)

`SettingsProvider` + `ThemeProvider` wrap `DashboardView` inside
`islands/Dashboard.tsx` for the same reason. Dual-use modules
(`lib/company.ts`, `lib/api.ts`) read `Deno.env` in `try` with a fallback so
island import stays safe.

## API contract

Full contract lives in `docs/API.md`. Summary:

- Wire (`lib/wireTypes.ts`): numeric ids only (`WireBarrier`,
  `WireKpiSnapshot`, `WireCategoryCompliance`, `BarriersQuery`,
  `BarriersResponse`). `complianceId` is intentionally omitted from
  `WireBarrier`.
- Domain (`lib/types.ts`): resolved display strings (`Barrier`,
  `KpiSnapshot`, `CategoryCompliance`, `Vocabularies`, `FilterState`).
  Open `string & {}` unions keep novel station values compilable.
- Bridge (`lib/enums/*` + `lib/resolve.ts` + `lib/api/query.ts`):
  `toXId` returns `undefined` on unknown (caller skips + warns),
  `fromXId` returns explicit sentinels (`ST-7`), `resolveBarrier` always
  derives `compliance` via `isCompliant()`.
- `BarriersApi` (`lib/api/types.ts`): `getBarriers`, `getAllBarriers`
  (http forces `pageSize: 100000`), `getBarrierById` (`null` only on 404),
  `getKpi` / `getChartData` (full filter subset, minus paging/sort).
- Routes: `GET /api/barriers`, `GET /api/barriers/:id`,
  `PATCH /api/barriers/:id/status` (admin write via `record_status_change()`,
  author derives from session), `GET /api/barriers/deleted` (admin, legacy
  alias for `?rowScope=deleted`),
  `GET /api/kpi`, `GET /api/chart`, `GET|POST /api/export` (csv/xlsx/pdf over
  the whole selection, streamed in batches),
  `GET /api/health` (DB-free liveness), `GET /api/vocabularies`
  (refresh cadence; SSR still seeds the first paint), `GET /api/sync-status`
  - `GET /api/sync-changes` (header health indicator, 1-minute cadence with
    a 15s fast lane while a run is in flight), `POST /api/auth/login`,
    `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`
    (own change, session-only), `GET/POST /api/users` (admin only; first
    account via `scripts/create-admin.ts`, never self-registered),
    `PATCH/DELETE /api/users/:id`, `GET/POST /api/alert-rules`,
    `PATCH/DELETE /api/alert-rules/:id`, `GET/POST /api/recipients`,
    `PATCH/DELETE /api/recipients/:id`, `GET /api/lookups` (admin forms),
    `GET/PUT /api/field-options` (curated sheet options),
    `PATCH /api/barriers/:id` (admin field update), plus `routes/login.tsx`
    (only public page) and the `LoginForm`/`BarrierEditor`
    islands. Admin management (users, recipients, alert rules, field
    options) lives in the settings sidepanel
    (`components/settings/AdminSection.tsx`), gated by `sessionUser.role`;
    there is no separate admin route. Barrier editing lives in the modal
    Editar tab (`islands/BarrierEditor.tsx`, admin only). Every
    authenticated user also gets a Conta tab (`AccountSection.tsx`) with a
    self-service password change (`POST /api/auth/password`, session-only).
- Access: Login => Dashboard. Data reads need a session or `ADMIN_TOKEN`
  (anonymous `404`, dead credentials `401`); `/` redirects logged-out
  visitors to `/login?next=`.
- Same-origin by design: the dashboard fetches `routes/api/*` from its own
  origin (`apiBaseUrl` defaults to `url.origin`), so no CORS headers are
  emitted. Split-origin deploys must proxy `/api/*` through the app origin.

## Persistence

- Fracttal data reference (`docs/FRACTTAL-DATA.md`): field census, join
  keys, status signal maturity, and the imported catalog, derived from
  streaming slices of the 480 MB tenant dump.
- Import pipeline (`scripts/fracttal-import.ts`): streams the dump from
  disk (char-scan JSON reader, constant memory), rebuilds `locations`,
  `categories`, and `barriers` from real data, and stamps
  `lib/server/fracttal/map.ts` import defaults. Dry-runs without `--apply`.
- Shared mapping rules (`lib/server/fracttal/barrier-rules.ts`): the one
  converged source for scope keywords, station parse, typology,
  work-event classification, and 4-state availability used by both the
  import and the live sync. Precedence: the import owns catalog rows
  (creates locations/categories on rebuild); the sync never creates
  them (unknown labels skip and are listed).
- Postgres (`docs/DATABASE.md`): lookup tables + `barriers` +
  `barrier_status_history` + `users`/`sessions` (cookie logins, two roles) +
  `alert_rules` (per-category triggers) + `alert_events`/`alert_recipients`.
  `compliance_id` is trigger-derived, the only
  write path is `record_status_change()`. Location and category ids are
  NOT frontend contracts - the server serves the dynamic id-keyed
  vocabularies (`{id, code, name, count}` and `{id, label}`) to the island, and
  `lib/resolve.ts` + `lib/api/query.ts` bind those ids at request time.
  `barriers.is_active` mirrors the upstream `active` flag and `deleted_at`
  the soft delete; list/KPI/chart/export honor the admin `rowScope`
  (`active`/`inactive`/`deleted`/`all`, default `active`) and the dashboard
  Situacao combo (admin only) switches it with row badges on off-scope rows.
  `scripts/migrate.ts` applies `db/schema.sql` + `db/seed_lookups.sql`
  (idempotent, seed approximates the imported catalog); `scripts/seed.ts`
  bulk-inserts `getWireBarriers()` output in batches of 500 (`--force`
  truncates first).
- Browser `localStorage`: `barrier-dashboard` (location, filters, selection,
  openId, ordered visible table columns plus hidden pinned filters,
  `defaultsVersion`; validated per-field on restore, stale page self-heals,
  and defaults a previous version implied are migrated away instead of
  replayed - `FILTER_DEFAULTS_VERSION` in `lib/dashboard/filters.ts`) and
  `barrier-settings` (theme, accent, density, motion, defaults).

## Config

See `.env.example`. `COMPANY_NAME` brands the top header, login card header,
splash card, and exports (empty = unbranded). The dashboard footer carries
the author signature, the settings panel and loading splash have no brand
copy, and the login footer is an unbranded session marker.
`PUBLIC_API_MODE` (`mock`/`http`) + `PUBLIC_API_BASE_URL` select the
adapter. `DATABASE_URL` feeds `lib/server/db.ts` and both `db:*` tasks.
`dev` needs shell exports; `start`/`db:*`/`fracttal:poll` read `.env`.

## Design principles

- Dynamic data, never fixed catalogs: stations, statuses, categories, and
  counts change without code changes (open unions, SSR/SQL vocabularies,
  `distinctBy`). Filter selects and settings default filters use live
  vocabularies only; no seed fallback is offered.
- Reconcile everywhere: fixed KPI fields + `other` novel-availability field +
  `by*` `GROUP BY` buckets, `resolveKpi` translates numeric-id keys, chart
  derives NC as `total - compliant` fail-closed, so novel values never vanish.
  Fixed fields + `other` always equal `total`.
- Layouts survive scale: paginated/server-paged regions, exports streamed in
  database-sized batches under one row ceiling (`EXPORT_MAX_ROWS`),
  debounced search, precomputed sort keys.
