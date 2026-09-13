# Backlog - petroleum-safety-barrier-monitor (priority-ordered, no dates)

P1 ships first. Each item lists Goal / Do / Do not / Acceptance / Touches.
Stack rules live in `docs/ARCHITECTURE.md` and `agents.md` (layer boundaries,
wire contract, Deno-only, docs updated in the same commit).

Locked decisions: Fracttal access is production-only (read-only, fixture
replay, never write to prod); auth starts as single `ADMIN_TOKEN` and grows
into a users table only when needed; server export is CSV only (Excel/PDF
stay client-side); deleted Fracttal assets use soft-delete.

## P1: Front-end polish + test - COMPLETE

Status (as-built): checklist closed. `deno task test` green at 86 tests,
`deno task check` green (12 baseline lint items), `vite build` + preview
smoke (`/`, `/api/health`) pass, mock browser-smoke 17/17 plus http
scenarios.

How each Do item landed:

- Polish & A11y: dialog a11y/focus, chart tooltip+legend, filter layout,
  pagination edges (jump ellipsis folds into the pager gap slot on any
  page), page canvas gradient + overscroll, page-only export notice in
  server mode (`ExportToolbar serverMode` / `data-page-export-note`).
- Tests: hook suite (`useDashboard`, server loading/error/retry), export
  round-trips, `toWireQuery` unknown paths, linkedom harness. HTTP-mode
  banner/retry is covered headlessly by `hooks/dashboard/server_test.ts`
  (fetch failure surfaces; `retry()` recovers and refetches); the smoke
  http scenarios mirror it end-to-end and need a browser runtime.
- Browser smoke: `scripts/browser-smoke.ts [url] [mock|http-ok|http-err]`.
  http-ok asserts the live-API dashboard (one page of rows, server KPI +
  chart, no banner, vocabularies tabs, export note); http-err drives the
  ServerErrorCard and asserts retry re-fires the fetch. Note: running any
  smoke scenario spawns headless Chromium; the suite itself stays green
  without it.

Do not: restyle from scratch, add features, touch SQL schema, call Fracttal.

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

Status: client + capture + provenance/mapping draft done (docs/FRACTTAL.md,
lib/server/fracttal/, scripts/fracttal-capture.ts, tests green). Live fixture
capture is blocked on prod credentials (Fracttal access is production-only);
`scripts/fixtures/` gets its sample via the reviewed capture procedure in
docs/FRACTTAL.md.

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

Status (as-built): schema migration landed (provenance columns, `sync_state`,
`alert_events`, author 10 "Sincronização Fracttal"), all default barrier
queries hide soft-deleted rows, mapper + pure reconcile planner + `runSync`
orchestrator tested headless (201 tests green at latest count; check at
12-problem baseline),
CLI `scripts/fracttal-sync.ts` verified end-to-end on a scratch Postgres:
dry-run shows reconcile counts, rerun idempotent, availability flip appends
one history row via `record_status_change` (author 10), deleted fixture row
stays in DB with `deleted_at` set and hides from the default `/api/barriers`
view. Sync failures notify ops (stderr always, optional SMTP email via native
`lib/server/fracttal/smtp.ts`) and exit non-zero after the `failed` audit row
is written. Soft-deleted rows are auditable through the token-guarded
`GET /api/barriers/deleted` (same filters/shape, deleted-only; default
views hide them). Cutover procedure (backup-first migrate, dual-run
mock-vs-http compare, checklist, rollback) in docs/API.md. Polling cadence landed (`lib/server/fracttal/runner.ts` +
`scripts/fracttal-poll.ts`): per-scope locks via `syncScopeRunning` (stale
after 10 min; verified against real Postgres - fresh `running` blocks, stale /
`ok` / `failed` do not), crashed ticks reschedule instead of killing the loop.
Live prod run remains blocked on prod credentials (production-only).

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

Status (as-built): error envelope `{ error, code, requestId }` +
`x-request-id` on all routes (500s keep their messages, never leak
internals); boot validation via `loadServerConfig` (http mode without
`DATABASE_URL` fails fast naming the variable); `PATCH .../status` requires
`Authorization: Bearer <ADMIN_TOKEN>` and fail-closes when unset; GET
openness decided and documented (reads open, writes token-gated -
docs/API.md); in-memory throttle per remote IP (120/30/10 per min for
read/write/export, health exempt); `GET /api/export?format=csv` streams the
filtered set (BOM + 14-col rows + RESUMO via shared `row()`/`csvCell()`/
`summaryRows()`, 10k cap with the filtered total named on overflow);
`CSV_HEADERS` single-sourced between browser and server exports. 201 tests
green at latest count (config/auth/throttle/errors/export units + DB-gated
fixture→upsert→GET/export integration, verified against real Postgres);
check at the 12-problem baseline.

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

Status (as-built): `lib/dashboard/urgent.ts` (`urgencyOf` critical/urgent/
none sobre a mesma base fail-closed do NcAlert, `compareUrgency` críticas
primeiro + `statusSince` mais antigo); recipients em `alert_recipients` com
CRUD total atrás de `ADMIN_TOKEN` (upsert por email); detecção via
`detectUrgentTransitions` (histórico → `resolveBarrier` → `isUrgent`) com
watermark `>=` (transição no mesmo dia após o watermark não é mais perdida)
e idempotência no UNIQUE `dedup_key`; `runAlertCycle` (dry-run default, um
digest por recipient, entrega por recipient para nunca duplicar em falha
parcial, dead-letter após 5 runs, `--reprocess`); mailer SMTP reusando o
cliente P3 (uma sessão por recipient, `sendWithRetry`), templates pt-BR no
repo; `scripts/alerts-check.ts` (`--apply`, `--reprocess`,
`--only-barrier`, `--json`, exit 1 + notify ops só em falha inesperada).
Verificado de ponta a ponta contra Postgres + sink SMTP de mentira: 1
email no run (assunto/corpo conferidos), 0 no rerun, falha de relay loga
`event <id>` e o run seguinte entrega; smoke `/` + `/api/health` verdes;
backup `pg_dump -Fc` → restore com contagens idênticas; operação
(systemd, cron, rollback para mock) em docs/API.md. 201 testes verdes na
última contagem (headless + integração DB-gated); check no baseline de
12 problemas.
Bugs reais achados no caminho e corrigidos: `close()` do SMTP estourava
`Bad resource ID` após o QUIT (email entregue virava falha + duplicata no
retry) e `updateRecipient` não passava `args` ao `queryRows` (PATCH 500).
