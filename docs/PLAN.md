# Plan - petroleum-safety-barrier-monitor dashboard rewrite + Fracttal readiness

> This file is the save-ready execution plan. Dashboard-only scope.
> The future Fracttal-consuming server (Postgres-backed, confidential) is out
> of scope. This plan prepares dashboard seams, contracts, and hygiene so that
> server can plug in later without rework.

## 1. Context and decisions

- Dashboard for petroleum safety barriers, fed in future by a server not built yet.
- That server will consume Fracttal API data and use Postgres.
- Focus now: rewrite the dashboard. Do not write the confidential consumer.
- Sync model agreed: webhooks for real-time plus polling for integrity. This is
  the right hybrid because webhooks alone get lost or reorder, polling alone is
  stale or wasteful. Hybrid gives low latency plus self-healing.
- Prior decisions kept: hygiene first, relaxed file limit (~200 lines, not
  strict 150), delete YAGNI dead code, allow breaking fix to `WireKpiSnapshot`
  plus SQL.

## 2. Is the code ready? No

Current flow:

```text
lib/data.ts mock 6800 rows -> mockApi -> resolve -> routes/index.tsx SSR full array
-> Dashboard initialBarriers -> useDashboard client filter/sort/paginate/KPI/chart
```

Parallel unused path: `routes/api/* -> lib/server/sql/* -> Postgres`.

Blockers:

1. `routes/index.tsx` hardcodes `mockApi.getAllBarriers({})`. Ships full dataset
   as props. No paged mode, no `syncedAt`, no stale or error states.
2. `hooks/useDashboard.ts` filters, sorts, paginates, and aggregates all rows in
   browser. Sort recomputes `toLowerCase + localeCompare pt-BR` per compare.
   Fails at 50k rows.
3. `lib/api.ts getAllBarriers pageSize:100000`, `sql/barriers.ts` cap 100k. No
   cursor, no chunking, no `since/until`, no timeout. Export builds a 30-80MB
   HTML string plus 50k `<tr>` print DOM.
4. Wire plus SQL drop new values: `getKpi` hardcodes 6x
   `disponibilidade_id=0..5`, `WireKpiSnapshot` has no `by*` buckets,
   `computeKpi` drops novel conformidade from fixed fields while
   `computeChartData` lumps it into NC. Chart NC differs from KPI NC.
5. `toXId ?? 0` maps unknown to a wrong known id. `fromXId` maps unknown id to
   a plausible label. Silent corruption on new Fracttal taxonomy.
6. No provenance: no `externalCode`, `sourceUpdatedAt`, `syncVersion`, or
   `sync_state` table. `barriers.id identity` collides with Fracttal ids. Upsert
   is impossible.
7. Auth and config not ready: no `lib/server/config.ts`, `getEnv` silent mock
   fallback, boot-time consts, `.env` vs `.env.local` split (`dev` loads none,
   `start` loads `.env`, `db:*` loads `.env.local`), no `PUBLIC_` vs
   server-only enforcement.
8. Hygiene debt: 24/42 files violate import-desc rule, 7 missing headers, near
   zero function comments, 22 files over limit (worst `SettingsPanel` 1022,
   `BarrierModal` 726, `BarriersTable` 627), 2 dead deps (`@std/csv`,
   `@types/babel__core`), stale `.next/`, triple filter/sort/KPI/color
   implementations, 7 swallowed `catch{}` blocks.

## 3. What must change - dashboard scope only

### A. Data contract (dashboard side)

- Extend `WireKpiSnapshot` with `byDisponibilidade`, `byConformidade`,
  `byCriticidade`, plus `syncedAt`. Keep numeric wire and string domain.
  Keep `conformidade` derived client-side, never trusted from wire.
- Add opaque provenance passthrough (`externalCode`, `sourceUpdatedAt`). No
  Fracttal logic in dashboard.
- Strict mappers: `toXId` throws on unknown, `fromXId` returns an unknown
  sentinel plus hash fallback color, never a fake known label.
- Extend `BarriersQuery` with `since/until` plus bounds validation (`page`
  and `pageSize` max, `sortCol` whitelist, escape `%/_` in `ILIKE`).

### B. Data loading (stop shipping full table)

- `routes/index.tsx`: respect `PUBLIC_API_MODE`, query paged `listBarriers`
  plus `getKpi` on server or via `httpAdapter`. Pass `initialPage + total +
  kpi + syncedAt`, not the full array.
- `useDashboard` plus `Dashboard` island: server-paginated mode calling
  `api.getBarriers` and `api.getKpi` on location, filter, and page change, with
  loading, error, and stale UI. Keep client full-array mode for mock demo only.
- Remove `getAllBarriers 100k` hack from export and KPI paths. Use server
  aggregation.
- Add `GET /api/health` and a unified error envelope
  `{error,code,requestId}`: `400` on bad query, `502` on upstream or DB, typed
  client errors, no `catch -> null`.

### C. Reconciliation and scale

- Fix SQL `getKpi` to `GROUP BY` dynamic buckets.
- Unify novel-conformidade policy: `non-conforme = total - conforme -
  explicit-new`, applied the same way in `computeKpi`, `computeChartData`,
  `KpiGrid`, and export `summaryRows`.
- Fix `ncCount = kpi.naoConforme`, not `degradado + indisponivel`.
- Perf: reuse single-pass `computeKpi` (remove 9-pass export counting),
  precomputed sort keys plus `Intl.Collator`, debounced query, CSV-first export
  with row cap, `pg_trgm` index or rename misleading `tag_trgm` btree.
- Keep working scale invariants: chart scroll cap at 18 rows, table
  pagination, scrollable pills, capped stagger delays.

### D. Config and secrets hygiene (no confidential code)

- Add `lib/server/config.ts` spec only: reads bare non-`PUBLIC_` vars,
  validates shape, throws at boot without echoing values.
- Fix `deno.jsonc` env-file story plus docs (`DATABASE.md`, `API.md`,
  `.env.example` header): one canonical file or an explicit per-task map. Fix
  `dev` loading no file today.
- Codify `PUBLIC_` as client-safe and may-bundle vs bare as server-only in
  `lib/server` only. Enforce `islands/*` never imports `lib/server/*`.
- Delete dead code: `ThemeToggle`, `THEME/ACCENT_CODES`, unused `to*`,
  `LOCATION_DIST`, members CRUD preview, `ALL` DB sentinel row, `.next/`,
  dead deps.

### E. Decomposition (relaxed ~200 lines)

- Split `SettingsPanel/`, `BarrierModal/`, `Table/`, `export/`, `chart/`,
  `constants/`, `icons/`, `api/`, `sql/`, and `useDashboard` slices. New files
  stay under ~200 lines with one responsibility each. Colocate
  `*-options.ts` and `*-geometry.ts` next to owners.

### F. Non-goals

- No Fracttal OAuth, fetch, mapping values, webhook receiver, poller, or
  secrets. Only dashboard seams plus placeholders in `.env.example` and docs.

## 4. Execution phases

- Phase 0 baseline (0.5d): snapshot `deno check`, `lint`, `fmt --check`,
  `wc -l`, `git status`, divergence matrix.
- Phase 1 hygiene (1-2d): dead deps, `.next/`, imports desc, 7 headers,
  function comments. Gate: `deno check`, `deno lint`, `deno fmt` in order, no
  file args.
- Phase 2 contract plus mappers (2d): wire `by*` plus `syncedAt`, strict
  `to/fromXId`, provenance passthrough, query validation. Gate:
  `chaos-scale.ts` extended to SQL path plus novel status.
- Phase 3 loading plus errors (2-3d): paged index, server-mode hook, health
  and error envelope, lazy pool, FK and range checks, storage validation plus
  hydration race fix. Gate: mock vs http parity, stale-page trap fixed.
- Phase 4 scale plus reconcile (2d): `GROUP BY` KPI, unified NC policy,
  single-pass export, sort and collator and debounce, trigram, export cap.
  Gate: 50k synthetic perf check.
- Phase 5 decomposition (3-4d): splits above, no behavior change. Gate per
  split: check, lint, fmt.
- Phase 6 docs plus final gate (1d): fix `DATABASE.md` Fresh paths, env-file
  docs, API contract, mapping policy, sync ownership note (future server wins,
  trigger derives conformidade). Final full gate.
- Commits: atomic Conventional Commits, one logical change each.

## 5. Risks

- Multiline import length metric is ambiguous (physical first-line vs logical
  total). Confirm before mass reorder.
- Wire break needs the future server to return `by*` plus `syncedAt`.
  Dashboard must degrade to fixed fields with a warning until then.
- Strict `fromXId` will surface previously hidden bad rows as Unknown. Needs
  UI empty-state copy.
