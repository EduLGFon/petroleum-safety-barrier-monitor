# Decisions

Append-only architecture decision records. Newest last.

## D01 - Feature-preserving database index pass (2026-10-08)

Context: massive query-optimization request. Previous draft proposed
limits that would remove current features (pageSize clamp 100000 to 100,
dropping history join from list/export, pg_trgm extension, unbounded-query
truncation). Owner instruction: drop anything that limits or removes any
current feature.

Decision: implement additive-only speedups first. No contract, cap,
throttle, or pacing-guard change.

- Added (all `if not exists`, plain btree, no new extension):
  `idx_barriers_typology`, `idx_barriers_owner`,
  `idx_history_date_id(date desc, id desc)`,
  `idx_alert_events_transition`, `idx_alert_events_barrier_created`,
  `idx_sync_state_scope_status(scope, status, finished_at desc)`,
  `idx_throttle_reset`.
- Kept: pageSize clamp `1..100000`, 5000-row export batches, 200000-row
  ceiling, 500-row seed batches, Fracttal 100-row pages with loud abort,
  throttle windows, adaptive rate bucket, overlap lock, dedup keys,
  `record_status_change()` as the only status write path, btree tag index
  with documented `%q%` seq-scan (pg_trgm stays out per docs/DATABASE.md).
- Dropped from plan: pg_trgm GIN indexes, history-join removal, OFFSET to
  keyset without full sort-key coverage, any LIMIT that silently drops rows,
  any public caching of private rows.

Consequences: read filters/sorts and poll-lock/alert scans use indexes;
write path, API shapes, and caps unchanged. Follow-ups must stay additive
(COUNT OVER, single-query KPI with identical numbers, batched writes
through `record_status_change()` semantics, per-chunk transactions) with
docs updated in the same commit.

Verification: `deno task check` (includes migration-order guard).

## D02 - Read round-trip collapse (2026-10-08)

Context: dashboard fan-out runs list+count (2 scans), KPI (5-6 scans),
chart, vocabularies on every poll. No contract change allowed.

Decision: `listBarriers` carries the total as `count(*) OVER()` on each
row (one scan; out-of-range empty pages take one count query so
totalPages stays exact). `getKpi` runs the fixed-field aggregate plus one
tagged `UNION ALL` bucket query (2 round-trips, 3 with admin scopeCounts)
with the same filter subset and fail-closed NC definition per branch.
Wire shapes, pageSize clamp, and scope gating unchanged.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).

## D03 - Atomic chunked sync apply with batched audit (2026-10-08)

Context: `applyPlan` ran N barriers x 2-3 sequential statements in
autocommit, so a crash left half-applied runs and every audit row cost a
round-trip. Bulk `UNNEST` rewrites were rejected: they would bypass the
sanctioned `record_status_change()` path semantics and cannot be verified
without a live Postgres here.

Decision: new `withTx` helper in `lib/server/db.ts` (single-connection
BEGIN/COMMIT/ROLLBACK, guarded release, no stale retry since replaying a
partial tx is unsafe). `applyPlan` commits in `SYNC_APPLY_CHUNK=200`
transactions with identical per-row SQL (same UPDATE text, same
`record_status_change()` calls, same UNIQUE-conflict skip counting).
Audit rows collect per chunk and insert in one multi-row statement after
commit (best-effort preserved: empty/null skips, warn on missing table,
per-row `recordBarrierChange` fallback so one bad row never drops the
rest). Barrier-write failure still fails the run; audit failure never
fails barrier writes.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).

## D04 - Sync-changes list round-trip collapse (2026-10-08)

Context: `listSyncChanges` ran a standalone count plus the page query
sequentially (2 round-trips per header-page interaction).

Decision: same `count(*) OVER()` treatment as D02. The page-to-barrier
joins are all to-one, so the window total matches the old count exactly;
out-of-range empty pages take the old count query so totalPages stays
exact. Summary path (`summarizeAuditRows`) untouched: its three
aggregations use different joins over a small per-run table and are
already parallel, so a rewrite has no concrete benefit.

Verification: `deno fmt --check`, `deno check`, `deno task test`
(576 passed; DB integration suites self-skip without DATABASE_URL).

## D05 - Assessed and deferred (2026-10-08)

The following were investigated and deliberately NOT changed. Each needs
a live Postgres and/or running app to verify, and live runs need owner
authorization (agents.md section 12). Doing them blind would risk silent
behavior drift against the no-limits rule.

- `getSyncStatus` 4 parallel lookups: all are `LIMIT 1` index scans
  already parallel, so folding saves checkouts only. No concrete benefit.
- `summarizeAuditRows` 3 parallel aggs: different joins per aggregation
  over a small per-run table. Same verdict as above.
- `getVocabularies` / `getResolverLabels` caching: per-request data
  behind auth and admin rowScope gating. A shared cache needs an ADR
  proving no cross-session leak plus live poll verification.
- `loadLocal` OR-split: measured on the docker DB (18k barriers):
  PK scan plus filter in 6.6ms once per cycle. Technically index-defeating,
  practically negligible next to minutes of upstream fetch. Left as-is;
  a single query also avoids an N+1 worse than the filter.
- Alert `countRuleEvents` batching: dry-run `alerts-check` on the docker
  DB detects 39 candidates in seconds with no writes. No concrete benefit
  at current rule/candidate volume; revisit if rules multiply.
- `ensureCatalog` sequence use, `authors` identity change: sync write-path
  changes with no measured pain (catalog inserts are chunked and
  idempotent; author creates are rare admin actions). Left as-is.
- Upstream fetch-concurrency tuning: needs live rate-limit observation
  across full sweeps; the adaptive bucket already governs the ceiling.
- HTTP `ETag` (server emission): DONE, see D08. Aggregate dashboard
  endpoint and client 304 handling remain: new contract surface, needs
  browser-verified poll behavior.
- Export OFFSET to keyset: DONE, see D07 (65s tag-sorted export at 13k
  rows was the concrete trigger).
- `EXPLAIN (ANALYZE, BUFFERS)` baseline and load test: not run. No
  database is reachable in this session and `.env` secrets are
  off-limits. Run on staging before and after: list, KPI, export,
  and one `--apply` sync drill.

## D06 - Sync-status timestamp contract fix (2026-10-08)

Context: the DB integration suite finally ran against a populated
database (docker `db` service, one-shot tools container with the working
tree bind-mounted since `*.test.ts` never ships in the image). It exposed
a pre-existing failure no empty DB could show:
`sync-status_test.ts:114` expects `lastRun.finishedAt` to be a string,
but the driver returns `timestamptz` as a `Date`.

Decision: normalize to ISO strings in `getSyncStatus` (new `asIsoString`
helper). The `SyncStatus` contract already declares strings, and wire
JSON serializes `Date` to the same ISO form, so bytes on the wire are
unchanged; only the in-process shape now matches the type. Untouched:
`getLatestFinishedRun` / `getSyncRuns` carry the same driver-level lie
but are wire-serialized and covered by no failing test.

Verification: targeted DB suites plus full `deno task test` equivalent
in the tools container, 576 passed, 0 failed, against the docker DB.

## D07 - Keyset export paging (2026-10-08)

Context: measured a full-scope export walk on the docker DB (13k rows):
tag-ordered pages took ~22s each (65s total) from OFFSET rescans plus a
full sort per page; id order took 0.9s.

Decision: new `listBarrierWindowAfter` (keyset cursor: sort value plus
`b.id` tiebreaker) with row predicates that keep the exact ORDER BY
semantics of the OFFSET walk, including NULL placement for the only
nullable sort column (`owner`: ASC NULLS LAST, DESC NULLS FIRST).
`exportBatches` full walks page by cursor; offset windows keep the stable
OFFSET walk so print slices stay addressable. `listBarrierWindow` kept
for those callers. A first version missed the DESC NULL-to-value
crossing and an unused bind param; both were caught before commit (the
former by the new test, the latter by Postgres param typing).

Verification: temporary walk-equality script over all 10 sortable
columns x both directions x unknown-column fallback on 13k live rows:
identical sequences, tag pages ~70-250ms (65s to under 2s total).
Permanent `export_window_test.ts` (12 KST rows incl. null owners,
limit 5, all sorts) passes against the docker DB. Full suite: 577
passed, 0 failed.

## D08 - Conditional GETs with body-hash ETags (2026-10-08)

Context: dashboard polls re-download unchanged JSON on every tick
(sync-status every 60s/15s, barriers/KPI/chart/vocabularies every
5 minutes). No cache headers existed, so even the browser HTTP cache
could not help.

Decision: `okWithEtag(req, data, requestId)` in `lib/server/errors.ts`
(SHA-256 over the exact response bytes, `Cache-Control: private,
no-cache`, `304` with no body on matching `If-None-Match`), used by all
17 GET JSON handlers. Write responses, the export streams, and the
time-varying `/api/health` liveness probe are untouched. `private`
keeps authenticated bodies out of shared caches; per-request server
validation keeps role-gated data correct, so no feature is limited or
removed and callers that never send the header see byte-identical
responses. Client `If-None-Match` sending plus 304 handling in
`lib/api/http.ts` is the follow-up that turns the headers into saved
bytes. Update: client half DONE in the same release line - `fetchJson`
revalidates per URL from a bounded (50 entries) per-adapter memory
cache and serves 304s from memory; caches never cross adapters.

Verification: new `errors_test.ts` cases (stable tag, exact/weak/list/
wildcard match, foreign tag, changed bytes), new `http_test.ts` cases
(revalidate-then-304, tag-change refresh), `deno task check`, full
`deno task test` on host and against the docker DB. Live HTTP 304 round
trips were not exercised end to end (no valid credential available
without touching secrets); the deployed dashboard exercises them on
the next deploy.

## D09 - Duplication-guard hardening (2026-10-08)

Context: review of the dedup design found six residual paths where
duplicates or inconsistency could still slip in: retried same-status
PATCHes appended duplicate history rows, the single-write-path rule was
convention only, sync audit retries could double-insert, catalog/author
`max(id)+1` allocation raced, the running-lease claim raced under READ
COMMITTED, and nullable `external_code` rows would be invisible to
reconcile.

Decision: close all six with DB enforcement first, app guards second.

- Same-status `transitionBarrierStatus()` returns the current row with
  no write; `PATCH /api/barriers/:id/status` early-returns before the
  alert fan-out. The generic `PATCH /api/barriers/:id` already skipped
  unchanged statuses.
- `trg_guard_availability_write` rejects any direct `UPDATE OF
  availability_id` unless `record_status_change()` set
  `app.status_write` first (transaction-local GUC). INSERTs and sync
  field writes are unaffected.
- `uniq_sync_changes_run_barrier` plus `ON CONFLICT DO NOTHING` in
  `insertAuditBatch`/`recordBarrierChange` makes audit retries
  idempotent (best-effort-after-commit semantics kept per D03).
- `ensureCatalog` and `getOrCreateAuthor` serialize allocation with
  `pg_advisory_xact_lock` inside one transaction; UNIQUE label/code/
  name constraints stay the backstop.
- `uniq_sync_state_running_scope` partial unique index plus unique-
  violation mapping to `ScopeBusyError` makes the lease claim atomic.
- `barriers.external_code` is now `NOT NULL` (clean DBs via DDL,
  existing DBs via idempotent `ALTER ... SET NOT NULL`, fail-closed
  on legacy NULL rows).

Verification: new `dedup_test.ts` (pure `isUniqueViolation` cases) and
`dedup_integration_test.ts` (same-status no-op, guard rejection,
audit-once, lease-busy; self-skip without DATABASE_URL), `deno task
check`, full `deno task test` on host and against the migrated docker
DB. Docs updated in the same change (`docs/DATABASE.md`,
`docs/ARCHITECTURE.md`, `readme.md`).

## D10 - Central structured server logger (2026-10-08)

Context: logging was scattered `console.*` calls with ad-hoc prefixes
(`[db]`, `[sync]`, `[poll]`, `[ops]`), no levels, no timestamps, no
consistent request correlation, and no secret redaction.

Decision: new `lib/server/log.ts` (no new dependencies) as the single
server logging contract. Levels `debug/info/warn/error` plus `audit`
(greppable info with `audit=true`), `LOG_LEVEL` (default `info`) and
`LOG_FORMAT=text|json` env controls (`.env.example`), timestamp plus
scope plus `requestId` on every line, `debug/info` to stdout and
`warn/error` to stderr, key-based secret redaction (`[REDACTED]`,
narrow list so `author` never matches) plus `postgres://` value
redaction, truncation, circular-guard, and never-throw emits. `child()`
binds scope/request context; `line()` adapts legacy
`(line: string) => void` callbacks; `forRequest()` binds the same id
the error envelope and `x-request-id` header carry. Migrated the
server core (`errors.ts`, `auth.ts`, `db.ts`, `sql/sync.ts`,
`fracttal/{notify,runner,cycle}.ts`), request-scoped logging in the
two barrier write routes plus `auth/me`, and structured line loggers
in `alerts-poll`/`alerts-check`. CLI result output (`--json`,
summaries) stays plain `console.log` for piping. Browser
`console.warn` calls (query mapping) untouched.

Verification: new `log_test.ts` (15 cases: parsing, filtering, sinks,
redaction, error/circular safety, child/line/audit, request binding),
`deno task check`, full `deno task test`.

## D11 - Contingency derivation from work text plus manual sheet flag (2026-10-16)

Context: 20k Fracttal-imported barriers showed zero contingency rows.
Two `Contingenciado` display states exist (ids 2/3, compliant) but no
code path ever produced them: `resolveAvailability` only emitted 0/1/4/5
and the import/sync never wrote `has_contingency`. The dump census
found zero explicit contingency hits, so the signal had to be defined,
not discovered.

Decision: two sources promote to the same states. Auto: open corrective
work whose free text matches `contingenc`, a `GM-...` evidence code (or
bare `GM`), or a `CEC` token (`isContingencyText` /
`hasContingencySignal`, scanning description plus task notes, labels and
custom status) promotes 4 to 3 / 5 to 2 at derivation time and writes
`has_contingency = 'Sim'` plus the source snippet; preventive notes
stay inert (no corrective slot, no promotion). Manual: stored 4/5 with
sheet `Sim` read as 3/2 everywhere (`effectiveAvailabilityId` in
`resolveBarrier` plus the same `CASE` in KPI/chart/vocabulary/filter
SQL), and `PATCH /api/barriers/:id` materializes the overlay to stored
2/3 via a second `record_status_change()` (explicit `availabilityId`
wins over the overlay). Sync preserves manual flags
(`coalesce($new, has_contingency)`) and never clears them; admin-owned
statuses keep the existing override guard. The compliance trigger stays
base-only; all reads derive effective compliance.

Verification: new unit tests (flag/text/signal helpers, overlay,
work-slot flagging, `mapAsset` 2/3 promotion, `resolveBarrier`
promotion), live-DB checks (filter `availabilityId=3` finds `4+Sim`
rows, KPI and chart `compliant+1` with total unchanged), full
`deno task test` (592 passed). Docs updated in the same change
(`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`,
`docs/FRACTTAL-DATA.md`, `readme.md`).

## D12 - Provider second channel is `whatsapp`, not `messaging` (2026-10-16)

Context: homologation measured whole-payload `422 canal_nao_aceito` on
every `violada` alert with a phone-carrying recipient: the provider
accepts only `email`, `whatsapp` and `internal`, and our payload sent
`canal: "messaging"` / `canais: ["email", "messaging"]`. Hidden until a
second recipient with a phone was registered, because the second
channel only attaches for status 5 with a phone present.

Decision: send `canal: "whatsapp"` / `canais: ["email", "whatsapp"]`
(`lib/server/alerts/provider.ts`); internal `withMessaging` field name
and test titles kept (never hit the network). Docs updated in the same
change (`docs/API.md`, `docs/DATABASE.md` provider rows plus fan-out
notes). Note for deploy: `routes/api/barriers/[id].ts` and
`routes/api/barriers/[id]/status.ts` import the provider for immediate
fan-out, so the app service needs a redeploy too, not just the poller
scripts.

Verification: `deno test lib/server/alerts/` (37 passed), full
`deno task test` (592 passed), homologation A/B proof (422 vs 202) plus
`--apply --reprocess --only-barrier 427` delivering 4 dispatches.

## D13 - Sheet inventory columns are sync-owned and never blank forever (2026-10-26)

Context: the barrier details modal rendered several GERAL inventory fields
as "Não informado" forever because the import wrote nulls and the sync
never touched them.

Decision: all 15 sheet columns (plus action_plan) are derived from
Fracttal asset fields, maintenance plan metadata, notes and open work via
`lib/server/fracttal/sheet-fields.ts`, shared by the dump import and the
live sync. `has_contingency` remains manual-safe via
`coalesce($new, has_contingency, 'Não')`; every other column is
overwritten on each sweep. `owner_id` and `grouping_id` are now derived
heuristically instead of hardcoded defaults. Preventive open work drives
`plan_followed` only and never availability. `extra_comments` always has
a `field_1`-based fallback so it is never empty.

## D14 - DEV-gated raw Fracttal detail inspection (2026-10-26)

Context: admins need to compare modal values with the upstream asset and its
related work rows while developing in HTTP mode.

Decision: `DEV=true` enables an on-demand raw-data panel for admins only.
The server resolves the selected barrier ID to its stored `external_code`;
clients cannot choose an arbitrary upstream code. It fetches the raw item,
plus code-filtered work orders and requests, returning original fields only
for exact-code matches. Related endpoints are capped at five 100-row pages
each, with excluded-row and truncation indicators. The API is read-only,
rate-limited to five requests/address/minute, and returns `private, no-store`;
raw payloads are not logged, cached, or persisted. Existing Fracttal adaptive
pacing and GET-only behavior remain in force.

Upstream basis: the documented Fracttal API reference in `docs/FRACTTAL.md`
lists `GET /items/{code}`, `code_asset` for work orders, and `code_item` for
work requests. The current official docs endpoint could not be fetched during
implementation, and no live tenant request was made; those filters therefore
remain unverified against the connected tenant.

## D15 - Quiet handling of concurrent sync lease claims (2026-10-26)

Context: concurrent pollers correctly left one `sync_state` lease owner, but
the losing insert still raised a PostgreSQL unique-constraint error that
appeared in Docker logs despite being caught and treated as normal contention.

Decision: retain `uniq_sync_state_running_scope` as the database authority and
use `ON CONFLICT (scope) WHERE status = 'running' DO NOTHING` in `startRun()`.
An empty result maps to `ScopeBusyError`, preserving the existing skipped
poller behavior without logging a routine collision as a database error.

Verification: the DB integration test now races two lease claims and asserts
one owner plus one `ScopeBusyError`; it self-skips when `DATABASE_URL` is
unset. `deno task check` and `deno task test` run after the change. The
race test requires the migrated Postgres schema and is not exercised by the
standard test command when `DATABASE_URL` is unset.

## D16 - Align Fracttal detail derivations with asset hierarchy (2026-10-26)

Context: review of barrier `1009435` found that a trailing asset leaf was
shown as its own installation location, SGI-LEC source references fell back
to the generic program origin, open-work trade overrode stable valve
ownership, and the same work description appeared under both Degradação and
Comentários.

Decision: derive `install_local` from the closest parent above a matching
asset leaf, recognize SGI-LEC references in notes, resolve owner from the
asset family before using open-work trade as a fallback, and omit the
Comentários section when its text duplicates Degradação. Clarify that
`plan_followed` concerns overdue preventive tasks only; corrective work does
not change that field. Keep the existing status date and history behavior
unchanged.

Verification: add sanitized synthetic mapping tests for the observed asset
hierarchy, SGI-LEC origin, valve owner with Instrumentação corrective work,
unknown-family trade fallback, and preventive-only plan semantics; add a
modal rendering regression test for duplicate comments and the clarified
label. Run `deno task check`, `deno task test`, and `deno task build`.

## D17 - Attribute and explain sync-generated status history (2026-10-27)

Context: status history recorded the sync service as author and a generic
sync note, while the per-barrier sync audit separately held the status diff.
An anonymized Fracttal work-order shape confirmed `created_by`,
`requested_by`, `personnel_description`, `user_assigned`,
`resources_human_resources`, and `validated_by_description`.

Decision: for new sync-generated history, display `created_by` as author and
fall back to `requested_by`. Snapshot the people and roles from those
Fracttal fields, explain the winning status signal using its classification,
reference, notes, and contingency/out-of-service evidence, and store
`sync_run_id` so `(sync_run_id, barrier_id)` joins to the per-barrier audit.
The existing `author_id` remains the sync identity because status ownership
and admin-override detection depend on it. If Fracttal provides no person,
the existing technical author remains visible. Existing history is not
backfilled. Work-request actor-field parity remains optional until observed.

The name/role snapshots and source explanation are retained with the
existing status-history row lifecycle and returned under the same barrier
read authorization; no new audience or retention period is introduced.
Fracttal operation text may contain identifying free text, so the history
entry preserves that text only when a new sync status entry is written.
These sync names and notes are not copied into alert emails; sync remains
identified as the source in that separate notification channel.

Verification: `deno task check`, import-order check, `deno task test`
(616 passed; database integration tests self-skipped because
`DATABASE_URL` is unset), and `deno task build` passed. Applying the schema
and exercising the PostgreSQL integration test were not possible without a
disposable database; no live sync was run.

## D18 - Explicit barrier contingency links (2026-10-27)

Context: operators need to identify the barrier tag that is backed by each
contingency barrier, review the reverse relationships, see the Gestão de
Mudança and Análise de Risco references, and know when a non-compliant barrier
has no eligible contingency. Existing `has_contingency` and
`contingency_desc` fields do not encode barrier-to-barrier relationships.

Decision: store links in a separate many-to-many `barrier_contingencies`
table, with optional text references per link. A candidate must be active,
not deleted, in the same location, exactly `Disponível`, and compliant;
the server rechecks this rule while locking both barriers before creating a
link. Keep existing links if later changes make them ineligible; admins can
review all links, while other users see links to active, non-deleted
barriers. Any authenticated user can read; admins alone can create, update,
and remove links. For a `Não Conforme` barrier with no currently eligible
outgoing link, show a text-only recommendation to put it out of operation.
Never change status from this feature. Mock mode does not pretend that an
in-memory relationship is persisted.

Consequences: upstream sync does not own or clear these local relationships.
The relationship endpoint returns at most 50 candidate tags per search and
signals more results so the operator can refine by tag. Management Change and
Risk Analysis are references, not uploaded documents or links.

Verification: `deno task check`, `deno run -A scripts/import-sort.ts`,
`deno task test` (620 passed; PostgreSQL integration test skipped because
`DATABASE_URL` is unset), and `deno task build` passed. Applying the schema
and exercising the PostgreSQL integration test were not possible without a
disposable database.
