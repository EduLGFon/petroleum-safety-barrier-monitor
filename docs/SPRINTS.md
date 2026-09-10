# Backlog - petroleum-safety-barrier-monitor (priority-ordered, no dates)

P1 ships first. Each item lists Goal / Do / Do not / Acceptance / Touches.
Stack rules live in `docs/ARCHITECTURE.md` and `agents.md` (layer boundaries,
wire contract, Deno-only, docs updated in the same commit).

Locked decisions: Fracttal access is production-only (read-only, fixture
replay, never write to prod); auth starts as single `ADMIN_TOKEN` and grows
into a users table only when needed; server export is CSV only (Excel/PDF
stay client-side); deleted Fracttal assets use soft-delete.

## P1: Front-end polish + test

Goal: stabilize what ships today before touching prod data.

Do:

- Polish only, no logic rewrites: loading/empty/error states
  (`ServerError.tsx`, splash), filter bar density/mobile, table pagination
  edges, chart tooltip/legend overflow, settings persistence UX.
- A11y sweep: roles/labels, keyboard reachability for modal/table/settings,
  focus trap in `BarrierModal`.
- Tests: hook tests (`useDashboard`, `useServerDashboard` with mocked
  `BarriersApi`), `resolve*` + export `rows/summary` round-trips,
  `toWireQuery` unknown-value paths. Keep existing pure-module suite green
  and extend it to `hooks/` + `lib/export/` + `lib/api/`.
- Expand `scripts/browser-smoke.ts` to http-mode banner/retry and the
  page-only export notice. Reuse `scripts/chaos-scale.ts` at 50k rows.

Do not: restyle from scratch, add features, touch SQL schema, call Fracttal.

Acceptance: checklist closed, `deno task test` green with new coverage,
`vite build` + preview smoke (`/`, `/api/health`) pass.

Touches: `components/*`, `islands/dashboard/*`, `hooks/dashboard/*`,
`scripts/browser-*.ts`, new `*_test.ts` next to hooks/export.

## P2: Fracttal safe-harbor spike (prod, read-only)

Goal: learn the real API without risking prod.

Do:

- Read-only client in `lib/server/fracttal/` (new, server-only): `fetch`
  with env token, timeout + retry, rate-limit respect, edge validation
  (narrow types, no `any`).
- Fixture capture `scripts/fracttal-capture.ts`: tiny bounded sample (one
  station, capped pages) to anonymized JSON in `scripts/fixtures/`. Later
  work replays fixtures, never prod.
- Mapping draft: Fracttal asset/status fields to `lib/enums/*` ids +
  `lib/wireTypes.ts`, unmapped values listed explicitly.
- Provenance design before code: `externalCode`, `sourceUpdatedAt`,
  `sync_state` shape, soft-delete flag semantics.

Do not: write to Postgres, schedule sync, commit prod tokens.

Acceptance: fixtures committed, mapping table reviewed, spike note records
endpoints used, limits seen, and ids needing new enum rows.

## P3: Import + sync pipeline

Goal: Fracttal rows land in Postgres idempotently, deletions soft.

Do:

- Migration: provenance columns (`external_code` unique, `source_updated_at`,
  `deleted_at` nullable, `is_deleted` derived or stored) + `sync_state`
  (cursor, insert/update/skip/error counts, duration) + `alert_events`
  (dedup key on barrier + transition date, `sent_at`).
- Upsert service (server-only): match by `externalCode`; insert/update
  `barriers`; append history only on real status change via existing
  `record_status_change()`; Fracttal deletions set `deleted_at` (row stays,
  dashboard filters it out by default, admin view can list deleted).
- Dedup by unique constraint on `external_code`, not app logic alone.
- Sync log per run + `scripts/fracttal-sync.ts --dry-run` default, live run
  behind explicit flag. Polling first; webhooks only if Fracttal supports
  them (with signature check).
- Sync failures notify ops separately from barrier alerts (log + optional
  ops email), so failures never go silent.
- Prod procedure: migrate against backup first, dual-run counts
  mock-vs-http compare, then cutover checklist with rollback to mock.

Do not: change dashboard queries, change wire contract, send barrier email.

Acceptance: dry-run on fixtures shows reconcile counts; rerun idempotent;
deleted fixture stays in DB with `deleted_at` set and hides from default
views; live prod run is read-capped and reviewed before scheduling.

## P4: API hardening + auth + server CSV export

Goal: close the genuine gaps. Already built and out of scope to rebuild:
`GET /api/barriers`, `/:id`, `/kpi`, `/chart`, `/health`, filters, search,
sort, `_params.ts` parsers.

Do:

- Standardize errors: `{error, code}` + `requestId`, keep 400/404/500 shapes
  compatible where feasible.
- Boot validation `lib/server/config.ts`: fail fast on missing
  `DATABASE_URL`/Fracttal env in http mode.
- Auth: single `ADMIN_TOKEN` env now, guard on
  `PATCH /api/barriers/:id/status` + recipient/admin routes. Shape the
  helper to grow into a users table later (multi-role only when more than
  one human needs distinct permissions; SSO deferred).
- Decide GET openness explicitly and document it (dashboard open vs token).
- Minimal throttle on public GETs + send path (Deno-native).
- Server `GET /api/export?format=csv` scoped by current query, streamed,
  capped, reusing `lib/export/rows.ts` + `summary.ts`. Excel/PDF remain
  client-side.
- Fixture integration tests: fixture -> upsert -> `GET` barriers/kpi/chart
  assertions.

Acceptance: unauthenticated PATCH rejected, export total matches filtered
total, fixture integration green.

## P5: Contingency + email alerts + prod readiness

Goal: urgent detection reaches people; routines are operable.

Do:

- Refine urgent predicate on top of `NcAlert` + urgent view + non-conforme
  KPI in `lib/dashboard/`, with tests (not a new rules engine).
- Recipients CRUD behind P4 auth.
- Event detection: transitions into urgent since last run, idempotent on
  `alert_events` dedup key (rerun sends zero duplicates).
- Mailer interface `lib/server/alerts/mailer.ts`, one provider, templates
  in repo, env secrets only, retry + dead-letter.
- Ops: scheduled sync + alert runs with logging and reprocessing flag;
  Postgres backup/restore verified; `start` service config; `/` +
  `/api/health` smoke; rollback to mock documented.

Acceptance: fixture transition triggers exactly one email; rerun sends
zero; failed run is retryable from log; prod deploy smokes pass.
