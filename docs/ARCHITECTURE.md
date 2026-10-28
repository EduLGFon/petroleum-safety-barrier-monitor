# Architecture - Safety Barrier Monitor

Stack: Deno-only Fresh 2 + Vite + Preact islands. No ORM, no `package.json`.

## Runtime lifecycle

`main.ts` boots one `App<State>` (`utils.ts` `define`) with `staticFiles()` + `fsRoutes()`. `client.ts` imports `static/styles.css` for HMR. `vite.config.ts` enables `@fresh/plugin-vite`.

Key tasks (`deno task <name>`):
- `check`: fmt/lint/check + migration-order guard.
- `test`: Deno tests (net/env gated).
- `dev`: `vite` (shell exports; `export $(cat .env | xargs)`).
- `build`: `vite build` -> `_fresh/server.js` + client/server.
- `preview`: `deno serve -A _fresh/server.js`.
- `start`: `deno serve --env-file=.env -A _fresh/server.js`.
- `db:migrate`: `scripts/migrate.ts` (schema + seed lookups).
- `db:seed`: `scripts/seed.ts` (mock generator, batches of 500; `--force` truncates).
- `fracttal:import/sync/force-sync/audit/poll/capture/extract`, `alerts:check/poll`, `admin:create`, `browser:capture/smoke`, `chaos-scale`, `docker:*`.
`COMPANY_NAME` read per request, not baked. `_app.tsx` renders shell + FOUC guard restoring theme/accent/density/motion from `barrier-settings`.

## Layer boundaries

- `routes/`: SSR + HTTP edge. `_app.tsx` shell, `index.tsx` mode switch, `api/*` parse via `_params.ts`, call `lib/server/sql/*`. No dashboard UI.
- `lib/`: pure/shared. No Preact, no localStorage. Barrels re-export split modules.
- `islands/`: hydrated JS only. `Dashboard.tsx` single root; `dashboard/` mode switch/sections/error UI. May import components/hooks/context/lib (non-server). Never `lib/server/*`.
- `components/`: static presentational, bundled in island subtree. Props-driven.
- `hooks/dashboard/` + `useDashboard.ts` + `useConnection.ts`: client state (island-only).
- `context/`: SettingsContext + ThemeContext, provided inside island root (server context does not reach islands).
- `lib/server/`: server-only Postgres pool + SQL repos + edge helpers. Only `routes/index.tsx` and `routes/api/*` import.

Boundary enforced by convention: `lib/server/db.ts` lazy `Pool` on `globalThis.__barrierPool` (import never throws; first `queryRows` throws if `DATABASE_URL` missing). Values bound as `$1/$2` via `queryObject`; `ORDER BY` via `SORTABLE` whitelist in `lib/server/sql/where.ts`.

## Data flows

Mock (`PUBLIC_API_MODE=mock`, default):
```
routes/index.tsx -> lib/api/mock.ts -> lib/mock/generator.ts -> Barrier[]
-> <Dashboard initialBarriers={full} apiMode="mock" vocabularies={null}>
-> DashboardView ClientView -> useDashboard + useDashboardVocabularies
-> DashboardSections (header, KPI, filter bar, table)
```
Full list ships as island props. No DB/fetch. Filtering/sort/pagination/KPI/chart client-side from `lib/dashboard/*`. Export full filtered set.

HTTP (`PUBLIC_API_MODE=http`):
SSR calls `getVocabularies()` (7 parallel SQL) and renders `<Dashboard initialBarriers={[]} vocabularies={...}>`. Rows never cross island boundary.
```
DashboardView ServerView -> useServerDashboard(baseUrl)
-> toWireQuery(filters) + httpAdapterFactory(baseUrl)
-> Promise.all([GET /api/barriers, /api/kpi, /api/chart])
-> resolve* -> render
```
Table pages use full filters; KPI/chart same subset minus paging/sort (`hooks/dashboard/server.ts`, scope builder `hooks/dashboard/scope.ts`). Cancel on supersede; first load splash, later refetchs keep stale rows. `error + rows==0` -> ServerErrorCard else ServerErrorBanner + retry. 5-min cadence (hidden tabs skip) refreshes data + vocabularies via `GET /api/vocabularies`. Exports via `GET|POST /api/export` over whole selection (ids in body, filters in query), streamed from DB in batches; cross-page selection exports completely; detail resolution page-local.

## Export pipeline

`lib/export/` one builder per format, same 30-column `rows.ts` mapping and `columns.ts` order, so browser/server emit identical cells. CSV text split into head/row/tail (`csv.ts`) driven by `lib/server/exportStream.ts` (paged batches -> byte stream). XLSX real OOXML: `lib/export/xlsx/` (`zip.ts` streaming ZIP deflate-raw + data descriptors, `xml.ts`, `styles.ts`, `widths.ts`, `parts.ts`, `dataSheet.ts`, `workbook.ts` shared by browser + route). PDF real PDF 1.4: `lib/export/pdf/` (`metrics.ts`, `columns.ts`, `layout.ts`, `writer.ts`, `document.ts` shared). No PDF library; base-14 fonts only, FlateDecode streams. Every format downloads as one file straight from DB batches, no preview step. Ceiling `lib/export/limits.ts`: 200,000 rows (under Excel 1,048,576). Report table uses fixed column shares summing printable width (`colGeometry`), text wraps, vector-crisp.

## Island bridge topology

Islands can't read `Deno.env`. Server config crosses as props from `routes/index.tsx`:
- `initialBarriers` (mock full list, http `[]`)
- `companyName` (via `lib/company.ts`)
- `apiMode` (`PUBLIC_API_MODE`, default mock)
- `apiBaseUrl` (`PUBLIC_API_BASE_URL`)
- `vocabularies` (`getVocabularies()` http, null mock)
- `sessionUser` (authenticated user or null)
`SettingsProvider` + `ThemeProvider` wrap `DashboardView` inside `islands/Dashboard.tsx`. Dual-use modules (`lib/company.ts`, `lib/api.ts`) read `Deno.env` in try with fallback.

## API contract

Full contract in `docs/API.md`. Summary:
- Wire (`lib/wireTypes.ts`): numeric ids only; `complianceId` omitted from `WireBarrier`.
- Domain (`lib/types.ts`): resolved display strings; open `string & {}` unions.
- Bridge (`lib/enums/*`, `lib/resolve.ts`, `lib/api/query.ts`): `toXId` returns undefined on unknown (skip+warn), `fromXId` explicit sentinels, `resolveBarrier` derives `compliance` via `isCompliant()` after promoting stored `Degradado`/`Indisponivel` with `has_contingency='Sim'` to contingency display states (`effectiveAvailabilityId`).
- `BarriersApi` (`lib/api/types.ts`): getBarriers, getAllBarriers (http forces pageSize 100000), getBarrierById (null only on 404), getKpi/getChartData (full filter subset minus paging/sort).
- Contingency client (`lib/api/contingencies.ts`) loads/mutates explicit barrier links via authenticated routes; HTTP mode only.
- Routes list (condensed): GET /api/barriers, /barriers/:id, /barriers/:id/fracttal-raw (admin+DEV), GET|POST|PATCH|DELETE /barriers/:id/contingencies, PATCH /barriers/:id/status, GET /barriers/deleted, /kpi, /chart, GET|POST /export, /health, /vocabularies, /sync-status, /sync-changes, /sync-runs, /barriers/:id/sync-detail, auth (login/logout/me/password), users, alert-rules, recipients, lookups, field-options, PATCH /barriers/:id. Plus `routes/login.tsx` (only public page) and `LoginForm`/`BarrierEditor` islands. Admin management in settings sidepanel (`AdminSection`), gated by role; no separate admin route. Barrier editing in modal Editar tab (admin only). Conta tab for self-service password change.
- Access: Login => Dashboard. Data reads need session or ADMIN_TOKEN (anonymous 404, dead creds 401); `/` redirects logged-out to `/login?next=`.
- Same-origin by design: dashboard fetches own origin (apiBaseUrl defaults to url.origin); no CORS. Split-origin must proxy.

## Persistence

- Fracttal data reference `docs/FRACTTAL-DATA.md`.
- Import pipeline `scripts/fracttal-import.ts`: streams dump from disk (char-scan JSON, constant memory), rebuilds locations/categories/barriers, stamps `lib/server/fracttal/map.ts` defaults. Dry-run without `--apply`.
- Shared mapping `lib/server/fracttal/barrier-rules.ts`: scope keywords, station parse, typology, work-event classification, contingency signals (`isContingencyFlag` for sheet `Sim`, `isContingencyText` for `contingenc`/`GM-...`/bare `GM`/`CEC`), availability. Base derivation yields four operational states (0/1/4/5); open corrective work with contingency signal promotes to Contingenciado (4->3, 5->2). Precedence: import owns full rebuilds (creates locations/categories deterministic ids); sync creates missing rows between rebuilds.
- Postgres (`docs/DATABASE.md`): lookups + barriers + barrier_contingencies (many-to-many links with optional Management Change/Risk Analysis) + barrier_status_history (retained Fracttal work-order author, participant names/roles, explanation, sync-run link) + users/sessions (cookie logins, two roles) + alert_rules (per-category triggers) + alert_events/alert_recipients. `compliance_id` trigger-derived; only write path `record_status_change()` (DB-enforced by `trg_guard_availability_write`; same-status no-op). Reads count effective availability (stored 4/5 with has_contingency='Sim' read as 3/2). Location/category ids are not frontend contracts; server serves dynamic id-keyed vocabularies; `lib/resolve.ts`+`lib/api/query.ts` bind at request time. `barriers.is_active` mirrors upstream `active`; `deleted_at` soft delete; list/KPI/chart/export honor admin `rowScope` (active/inactive/deleted/all, default active) and dashboard Situacao combo (admin only) switches it with row badges on off-scope rows. Contingency links local, independent of sync. Candidate creation rechecked server-side; requires live active Disponível/Conforme at same location. Existing links remain auditable when eligibility changes; admins review off-scope links, others only see links between active non-deleted barriers. Details modal marks visible ineligible links and recommends out-of-operation only for non-compliant barrier with no eligible outgoing link. Recommendation never writes status.
- migrate applies schema.sql + seed_lookups.sql (idempotent, seed approximates imported catalog); schema declarations precede ALTER TABLE and foreign-key dependencies, checked by `scripts/check-migration-order.ts`; seed bulk-inserts getWireBarriers() in batches of 500 (`--force` truncates).
- Browser localStorage: `barrier-dashboard` (location, filters, selection, openId, ordered visible table columns + hidden pinned filters, defaultsVersion; validated per-field on restore, stale page self-heals, defaults a previous version implied migrated away - `FILTER_DEFAULTS_VERSION` in `lib/dashboard/filters.ts`) and `barrier-settings` (theme, accent, density, motion, defaults).

## Config

See `.env.example`. `COMPANY_NAME` brands top header, login card header, splash card, exports (empty = unbranded). Dashboard footer carries author signature; settings panel and loading splash have no brand copy; login footer unbranded session marker. `PUBLIC_API_MODE` (mock/http) + `PUBLIC_API_BASE_URL` select adapter. `DATABASE_URL` feeds `lib/server/db.ts` and db:* tasks. `DEV=true` enables admin-only raw Fracttal detail panel and server route; never replaces auth. Raw responses fetched on demand, not cached/persisted; related work rows capped 500 per endpoint. `dev` needs shell exports; `start`/`db:*`/`fracttal:poll` read `.env`.

## Design principles

- Dynamic data, never fixed catalogs: stations, statuses, categories, counts change without code changes (open unions, SSR/SQL vocabularies, distinctBy). Filter selects and settings default filters use live vocabularies only; no seed fallback.
- Reconcile everywhere: fixed KPI fields + `other` novel-availability field + `by*` GROUP BY buckets, resolveKpi translates numeric-id keys, chart derives NC as `total - compliant` fail-closed, so novel values never vanish. Fixed fields + `other` always equal `total`.
- Layouts survive scale: paginated/server-paged regions, exports streamed in DB-sized batches under one row ceiling, debounced search, precomputed sort keys.
