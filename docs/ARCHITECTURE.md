# Arquitetura — Monitor de Barreiras

Single source of truth for modules, data flows, runtime lifecycle, island
bridge topology, persistence, and config. Read this before any architectural
change (see `agents.md` documentation rules).

Stack: Deno-only Fresh 2 + Vite + Preact islands. No ORM, no `package.json`.

## Runtime lifecycle

`main.ts` boots one `App<State>` (`utils.ts` `define`) with `staticFiles()`
plus `fsRoutes()`. `client.ts` only imports `static/styles.css` for HMR.
`vite.config.ts` enables `@fresh/plugin-vite`.

| Task         | Command                                                | Env source                                                  |
| ------------ | ------------------------------------------------------ | ----------------------------------------------------------- |
| `check`      | `deno fmt --check . && deno lint . && deno check`      | none                                                        |
| `test`       | `deno test .`                                          | shell only (pure modules)                                   |
| `dev`        | `vite`                                                 | shell only, no `--env-file`; `export $(cat .env \| xargs)`  |
| `build`      | `vite build`                                           | shell at build time; request-time env still needed at serve |
| `preview`    | `deno serve -A _fresh/server.js`                       | shell only, no `--env-file`                                 |
| `start`      | `deno serve --env-file=.env -A _fresh/server.js`       | `.env`                                                      |
| `db:migrate` | `deno run -A --env-file=.env.local scripts/migrate.ts` | `.env.local` (`DATABASE_URL`)                               |
| `db:seed`    | `deno run -A --env-file=.env.local scripts/seed.ts`    | `.env.local` (`DATABASE_URL`)                               |

`build` emits `_fresh/server.js` + `_fresh/server/` + `_fresh/client/`.
`COMPANY_NAME` is read per request, not baked at build time.
`routes/_app.tsx` renders the HTML shell plus a FOUC guard that restores
theme/accent/density/motion from `barrier-settings` before hydration.

## Layer boundaries

- `routes/` — SSR + HTTP edge only. `_app.tsx` shell, `index.tsx` mode
  switch, `api/*` handlers parse via `_params.ts` and call
  `lib/server/sql/*`. Never render dashboard UI.
- `lib/` — pure/shared logic. No Preact, no `localStorage`. Barrels
  (`lib/api.ts`, `lib/data.ts`, `lib/enums.ts`, `lib/constants.ts`,
  `lib/utils.ts`) re-export split modules underneath.
- `islands/` — only hydrated JS. `islands/Dashboard.tsx` is the single
  island root; `islands/dashboard/` holds the mode switch, sections, and
  server-error UI. May import `components/`, `hooks/`, `context/`, `lib/`
  (non-server). Must never import `lib/server/*`.
- `components/` — static presentational UI, bundled as part of the island
  subtree. Props-driven; vocabularies arrive via props.
- `hooks/dashboard/` + `hooks/useDashboard.ts` — client state (island-only).
- `context/` — `SettingsContext` + `ThemeContext`, provided inside the
  island root because server route context does not reach hydrated islands.
- `lib/server/` — server-only Postgres pool (`db.ts`) + SQL repositories.
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
  --> DashboardSections (Header, KpiSections, ExportToolbar, FilterBar, BarriersTable)
```

Full list ships as island props. No DB, no `fetch`. Filtering, sorting,
pagination, KPI, and chart all derive client-side from `lib/dashboard/*`.
Export covers the full filtered set.

### HTTP mode (`PUBLIC_API_MODE=http`)

SSR in `routes/index.tsx` calls `getVocabularies()` (4 parallel SQL queries)
and renders `<Dashboard initialBarriers={[]} vocabularies={...}>`. Rows never
cross the island boundary (50k+ scale).

```
DashboardView ServerView --> useServerDashboard(baseUrl)
  --> toWireQuery(domain filters) + httpAdapterFactory(baseUrl)
  --> Promise.all([GET /api/barriers, GET /api/kpi, GET /api/chart])
  --> resolveBarriers/resolveKpi/resolveChartData --> render
```

Table pages use full filters; KPI/chart scope by `locationId` only
(`hooks/dashboard/server.ts`). Requests cancel on supersede; first load shows
the splash, later refetches keep stale rows. `error + rows == 0` renders
`ServerErrorCard`, otherwise `ServerErrorBanner` with retry. Export and
detail resolution cover the loaded page only.

## Island bridge topology

Islands cannot read `Deno.env` in the browser. Server config crosses the
boundary as props from `routes/index.tsx`:

- `initialBarriers` (mock mode full list, http mode `[]`)
- `companyName` (`COMPANY_NAME` via `lib/company.ts`)
- `apiMode` (`PUBLIC_API_MODE`, default `mock`)
- `apiBaseUrl` (`PUBLIC_API_BASE_URL`)
- `vocabularies` (`getVocabularies()` in http mode, `null` in mock mode)

`SettingsProvider` + `ThemeProvider` wrap `DashboardView` inside
`islands/Dashboard.tsx` for the same reason. Dual-use modules
(`lib/company.ts`, `lib/api.ts`) read `Deno.env` in `try` with a fallback so
island import stays safe.

## API contract

Full contract lives in `docs/API.md`. Summary:

- Wire (`lib/wireTypes.ts`): numeric ids only (`WireBarrier`,
  `WireKpiSnapshot`, `WireCategoryConformidade`, `BarriersQuery`,
  `BarriersResponse`). `conformidadeId` is intentionally omitted from
  `WireBarrier`.
- Domain (`lib/types.ts`): resolved display strings (`Barrier`,
  `KpiSnapshot`, `CategoryConformidade`, `Vocabularies`, `FilterState`).
  Open `string & {}` unions keep novel station values compilable.
- Bridge (`lib/enums/*` + `lib/resolve.ts` + `lib/api/query.ts`):
  `toXId` returns `undefined` on unknown (caller skips + warns),
  `fromXId` returns explicit sentinels (`ST-7`), `resolveBarrier` always
  derives `conformidade` via `isConforme()`.
- `BarriersApi` (`lib/api/types.ts`): `getBarriers`, `getAllBarriers`
  (http forces `pageSize: 100000`), `getBarrierById` (`null` only on 404),
  `getKpi` / `getChartData` (both `locationId`-scoped).
- Routes: `GET /api/barriers`, `GET /api/barriers/:id`,
  `PATCH /api/barriers/:id/status` (bonus write path via
  `record_status_change()`), `GET /api/kpi`, `GET /api/chart`,
  `GET /api/health` (DB-free liveness). No `/api/vocabularies` route;
  vocabularies are SSR-only.

## Persistence

- Postgres (`docs/DATABASE.md`): lookup tables + `barriers` +
  `barrier_status_history`. `conformidade_id` is trigger-derived, the only
  write path is `record_status_change()`. `scripts/migrate.ts` applies
  `db/schema.sql` + `db/seed_lookups.sql` (idempotent);
  `scripts/seed.ts` bulk-inserts `getWireBarriers()` output in batches of
  500 (`--force` truncates first).
- Browser `localStorage`: `barrier-dashboard` (location, filters, selection,
  openId; validated per-field on restore, stale page self-heals) and
  `barrier-settings` (theme, accent, density, motion, defaults).

## Config

See `.env.example`. `COMPANY_NAME` brands titles/headers/exports (empty =
unbranded). `PUBLIC_API_MODE` (`mock`/`http`) + `PUBLIC_API_BASE_URL`
select the adapter. `DATABASE_URL` feeds `lib/server/db.ts` and both `db:*`
tasks. `dev` needs shell exports; `start` reads `.env`; `db:*` read
`.env.local`.

## Design principles

- Dynamic data, never fixed catalogs: stations, statuses, categories, and
  counts change without code changes (open unions, SSR/SQL vocabularies,
  `distinctBy`).
- Reconcile everywhere: fixed KPI fields + `by*` `GROUP BY` buckets,
  `resolveKpi` translates numeric-id keys, chart derives NC as
  `total - conforme` fail-closed, so novel values never vanish.
- Layouts survive scale: paginated/server-paged regions, capped export rows
  (`MAX_DOM_ROWS`), debounced search, precomputed sort keys.
