# Plan - petroleum-safety-barrier-monitor dashboard rewrite + Fracttal readiness

> AS-BUILT RECORD. The phases below are complete and committed on
> `refactor/fresh-deno-native`. Section 5 lists what was deliberately left
> out and the known limitations that remain. Section 6 records the docs
> refresh that fixed the drift noted in earlier rounds.
>
> Original scope: dashboard-only. The future Fracttal-consuming server
> (Postgres-backed, confidential) is out of scope. This work prepares
> dashboard seams, contracts, and hygiene so that server can plug in later.

## 1. Context and decisions (unchanged)

- Dashboard for petroleum safety barriers, fed in future by a server not built yet.
- That server will consume Fracttal API data and use Postgres.
- Sync model agreed: webhooks for real-time plus polling for integrity.
- Decisions kept throughout: hygiene first, relaxed file limit (~200 lines),
  delete YAGNI dead code, allow breaking fix to `WireKpiSnapshot` plus SQL.
- Verification per change: `deno check`, `deno lint`, `deno fmt` (no file
  args), plus `deno task test` once the suite existed; atomic Conventional
  Commits, one logical change each.

## 2. What was done

### Phase 0 - baseline

Snapshotted check/lint/fmt status and file inventory; committed the plan itself.

### Phase 1 - hygiene

- Removed `@std/csv`, `@types/babel__core`, stale `.next/`.
- Reordered imports repo-wide (descending logical length, longest first).
- Added the 7 missing top-of-file headers; documented all public functions.
- Result: `deno check` / `lint` / `fmt --check` green from here on.

### Phase 2 - contract plus mappers

- `WireKpiSnapshot` carries optional `byDisponibilidade/byConformidade/
  byCriticidade` (numeric-id keys) plus `syncedAt`; `resolveKpi` translates
  keys to display strings (string keys pass through for old servers).
- SQL `getKpi` returns the buckets via `GROUP BY`; mock `getKpi` stamps time.
- `toXId` returns `undefined` on unknown (callers skip + warn) instead of a
  wrong known id; `fromXId` returns explicit sentinels (`ST-7`,
  `Disponibilidade (6)`) instead of plausible labels.
- `BarriersQuery` gains `since/until`; `ILIKE` wildcards escaped; integer-only
  route params shared via `routes/api/_params.ts`; page/pageSize floored.

### Phase 3 - loading plus errors

- `routes/index.tsx` loads via mode-aware `api`; HTTP mode SSR's filter
  vocabularies (`getVocabularies`) while `useServerDashboard` pages
  (`getBarriers`), KPI (`getKpi`), and chart (`getChartData`) per scope with
  cancellation, loading, error card/banner, and retry. Mock mode unchanged.
- New `GET /api/chart` (Postgres `GROUP BY`, scoped by `locationId`) and `GET
  /api/health` (DB-independent liveness; both smoke-tested on the production
  bundle alongside `/`).
- Lazy DB pool (import no longer throws); write-path range/note validation;
  `http getBarrierById` returns null only on 404.
- Persisted dashboard/settings state validated per-field; stale-page
  self-heal; settings-defaults handoff sanitized; export failures surface
  inline; export count uses matched rows.

### Phase 4 - scale plus reconcile

- Fail-closed novel conformidade everywhere (`computeKpi`, `computeChartData`,
  KPI grid, alert now driven by `kpi.naoConforme`, exports); chaos-scale
  proves `conforme + naoConforme === total` with novel values.
- Export summaries derive from one `computeKpi` pass (was ~9 passes);
  `DISP_KNOWN_ORDER` shared by band and exports; DOM-heavy formats capped at
  10k rows with CSV guidance.
- Sort uses precomputed keys plus a shared `Intl.Collator`; search input
  debounced at 200ms.

### Phase 5 - decomposition

Every module split with barrels keeping import paths stable: `ui/icons`,
`lib/api` (`types/query/mock/http`), `lib/utils` (barrel over
`lib/dashboard/filters+kpi+chart` + `format`), `lib/export`
(`rows/summary/csv/excel/pdf/html`), `table/`, `barrier-modal/`, `chart/`,
`settings/`, `context/settings`, `hooks/dashboard`
(`filter-state/reducer/persistence/selection/derived/server`),
`lib/enums` (`codes/taxonomy/context`), `lib/constants`
(`locations/catalog/helpers/colors`), `lib/mock`
(`generator/history/tags/rng`), `lib/server/sql`
(`barriers/chart/vocabularies/where/mappers`), island `dashboard/`
(`DashboardView/DashboardSections/DashboardChrome/KpiSections/NcAlert/
ServerError/vocabularies`), `components/export`, `components/filter`,
`components/loading`. Zero files over 200 lines (verified: max 200).

### Follow-up rounds

- YAGNI deletions: ThemeToggle, THEME/ACCENT codes, unused `to*` mappers,
  `LOCATION_DIST`, members scaffolding + tab, `ALL` DB sentinel row.
- Docs drift: Fresh route paths, per-task env-file map, tag index rename.
- Small fixes: shared route parsers (incl. kpi float), urgent-view reset,
  location-aware `hasActiveFilters`, reference-counted body lock, date
  guards, chart tick dedupe, SQL `''` splitting.
- `deno task test`: 35 unit tests over pure modules (format, kpi, chart,
  filters, resolve, query, where, pagination, geometry).
- Production `vite build` plus preview smoke (`/`, `/api/health` 200).

## 3. Data loading as built

```text
mock mode:  routes/index SSR api.getAllBarriers -> <Dashboard
            initialBarriers={full list} apiMode="mock" vocabularies={null}>
            -> DashboardView ClientView -> useDashboard +
            useDashboardVocabularies -> DashboardSections shared tree
http mode:  routes/index SSR getVocabularies ->
            <Dashboard initialBarriers={[]} apiMode="http" vocabularies>
            -> DashboardView ServerView ->
            useServerDashboard(httpAdapterFactory + toWireQuery) ->
            Promise.all(getBarriers[full filters], getKpi[locationId],
            getChartData[locationId]) with cancellation ->
            DashboardSections shared tree
shared:     DashboardSections render tree; filter-state/selection/persistence
            slices (reducer/derived); server-only SQL under lib/server (never
            imported by islands); providers inside island root; page-only
            export/detail in server mode
```

See `docs/ARCHITECTURE.md` for the full lifecycle, bridge topology, and
persistence map.

## 4. Non-goals (unchanged)

- No Fracttal OAuth, fetch, mapping values, webhook receiver, poller, or
  secrets. Only dashboard seams plus placeholders in `.env.example` and docs.

## 5. Deliberately left out / known limitations

- No `externalCode` / `sourceUpdatedAt` provenance passthrough and no
  `sync_state` table (planned, unneeded until the sync worker exists).
- No `lib/server/config.ts` boot validation; no unified `{error,code,
  requestId}` envelope; `getAllBarriers` 100k path retained for mock/export.
- Settings-defaults race (gate firing before settings hydration) narrowed by
  sanitization but not re-architected; page-only export and page-local detail
  resolution in server mode (documented in code).
- `toXId` skips unknown values with a warning instead of throwing (so live
  filters degrade visibly rather than crash).
- `pg_trgm` not adopted: `%q%` does seq-scan by documented decision.

## 6. Docs refresh (this round)

- Created missing `docs/ARCHITECTURE.md` (referenced by `agents.md`):
  runtime lifecycle per task with env sources, layer boundaries, mock vs http
  flows, island bridge props, API/persistence/config summaries.
- Refreshed `docs/API.md`: 5-method `BarriersApi`, split-module file table
  (`lib/api/*`, `lib/enums/*`, `lib/constants/*`, `lib/mock/*`,
  `lib/server/sql/*`, `_params.ts`, client vs server vocabularies), full
  `BarriersQuery` params with clamping/whitelist, per-route status codes, no
  `/api/vocabularies` note, `toWireQuery` location fix.
- Refreshed `docs/DATABASE.md`: `jsr:@db/postgres` `Pool` + `$n` binding
  (not tagged templates), per-task env table incl. `build`/`preview`,
  `idx_history_barrier` + `set_updated_at` trigger, seed batch/`-1 → NULL`/
  `--force` details, full SQL file table.
- Fixed `.env` endpoint comment to list `GET /api/chart` + `GET /api/health`
  like `.env.example`.
