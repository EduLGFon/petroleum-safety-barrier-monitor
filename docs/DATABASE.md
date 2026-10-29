# Database - Barrier Monitor

No ORM: pure SQL via `jsr:@db/postgres` (Deno-native `Pool`), values bound as `$1/$2` via `queryObject` (never concatenating input into text; `ORDER BY` only via `SORTABLE` whitelist).

## Setup

```
createdb barreiras
cp .env.example .env   # edit DATABASE_URL
deno task db:migrate   # schema + seed lookups
deno task db:seed      # mock generator, batches of 500
# set PUBLIC_API_MODE=http, PUBLIC_API_BASE_URL=, DATABASE_URL=...
deno task dev          # or start (reads .env), preview (shell only)
```

Docker:

```
cp .env.example .env
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose run --rm tools deno run -A --env-file=.env scripts/fracttal-import.ts --dir /dump   # dry; add --apply (mount dump -v /srv/dump:/dump)
docker compose up -d
```

`db:migrate` and `db:seed` idempotent; reseed from scratch: `deno task db:seed -- --force` (TRUNCATE ... RESTART IDENTITY CASCADE).

## Why pure Postgres

Data contract existed before DB: `lib/wireTypes.ts` defines `WireBarrier` shape (numeric ids via `lib/enums/`), and `lib/api/http.ts` already consumes it. Direct SQL with Deno-native driver keeps layer thin: `schema.sql` declares truth, queries in `lib/server/sql/` shape into wire format, no codegen.

## Schema

Lookups (static): locations(id,code,type,name), availability_statuses(id,label,is_compliant), criticality_levels(id,label), categories(id,label), groupings(id,label), typologies(id,label), owners(id,label), loc_descs(id,label), authors(id,name).

barriers: id identity PK; tag text; location_id->locations; typology_id->typologies; loc_desc_id->loc_descs; criticality_id->criticality_levels; category_id->categories; grouping_id->groupings; owner_id->owners nullable (null="não informado"); availability_id->availability_statuses; compliance_id maintained by trigger, never written directly; comments, action_plan text; status_since date; 15 sheet inventory columns (origin, install_local, equip_typology, field_installed, field_operational, op_status, has_maint_plan, plan_followed, failure_free, maint_status, has_contingency, contingency_desc, evidence_code, degradation_desc, extra_comments) free text, null="não informado", admin-fillable; sync writes has_contingency='Sim'+contingency_desc only for auto-detected contingency rows, otherwise preserves local values; external_code text unique not null (Fracttal match key); source_updated_at timestamptz nullable; deleted_at timestamptz nullable (soft delete via sync); is_active boolean not null default true (Fracttal enable flag; false=Desativada); created_at/updated_at.

barrier_contingencies: barrier_id->barriers on delete cascade; contingency_barrier_id->barriers on delete cascade; management_change text nullable; risk_analysis text nullable; created_at/updated_at. Composite PK prevents duplicate links; check prevents self-contingency. Local operator-managed relationships, independent of sync. Soft-deleting preserves links for admin review; hard deletion cascades.

sync_state: id identity PK; scope text; status running|ok|failed; inserts/updates/deletes/skips; note text; started_at/finished_at.

alert_events: id identity PK; barrier_id->barriers on delete set null; transition_date date; status_id->availability_statuses; kind default 'barrier_transition'; dedup_key text unique (barrier+transition date); payload jsonb; sent_at timestamptz nullable.

alert_recipients: id identity PK; email text unique; name text default ''.

field_option_sets: field text PK (barrier sheet-question key); options jsonb; updated_by/updated_at; active boolean default true; created_at.

users: id identity PK; email text unique (lowercased); name text default ''; password_hash text (pbkdf2$iterations$salt$hash); role admin|user default user; active boolean default true; created_at/updated_at.

sessions: id identity PK; user_id->users on delete cascade; token_hash text unique (SHA-256 of cookie token); expires_at timestamptz (12h TTL); created_at.

alert_rules: id identity PK; name text unique; category_id->categories nullable (null=all); to_status_id->availability_statuses nullable (null=any non-compliant); critical_only boolean default false; include_recovery boolean default false; stale_days integer nullable; notify_immediate boolean default false; active boolean default true; created_at/updated_at.

barrier_status_history: id identity PK; barrier_id->barriers on delete cascade; date, status_id, author_id, note (may include Fracttal operation free text); sync_run_id->sync_state on delete set null (null=non-sync change); source_author Fracttal created_by/requested_by snapshot; participants JSON array of {name,role} snapshots.

### Lookup tables = contract with lib/enums/

Every id in static lookup tables must mean exactly the same as corresponding id in `lib/enums/` (`codes.ts`, `taxonomy.ts`, `context.ts`) - agreement lets frontend resolve `availability_id: 4` to `'Degradado'` without DB query. `db/seed_lookups.sql` populates id-by-id from same values (`ON CONFLICT(id) DO UPDATE`). Add new status/rank both to `lib/enums/` and `db/seed_lookups.sql`; never renumber existing row while barriers reference that id. `locations` and `categories` exempt: mirror live Fracttal taxonomy, start empty, filled by sync/import. `ALL (0)` UI-only, never a row (seed removes id=0 if unreferenced); `ownerId = -1` means no row (`owner_id NULL`).

### compliance_id derived, never written

Trigger `trg_barriers_set_compliance` (`BEFORE INSERT OR UPDATE OF availability_id`) recomputes `compliance_id` from `availability_statuses.is_compliant` whenever `availability_id` set/changes. `compliance_id` DEFAULT 1; not `GENERATED` because native syntax forbids joins and compliant set lives in lookup, not literals. Reads do not rely on stored `compliance_id` alone: KPI/chart/vocabularies/filters count effective availability (stored 4/5 with `has_contingency = 'Sim'` read as 3/2, hence compliant), matching `resolveBarrier`. Trigger stays base-only; `PATCH /api/barriers/:id` materializes manual `Sim` to stored 2/3 via second `record_status_change()` (`"Contingência registrada"`, clearing demotes back), so stored and display converge on next write. `updated_at` maintained by `trg_barriers_updated_at` (`BEFORE UPDATE` via `set_updated_at()`).

### Only write path: record_status_change()

Changing status should never be direct `UPDATE barriers SET availability_id`. SQL function `record_status_change(barrier_id, status_id, author_id, note, sync_run_id, source_author, participants)` updates `availability_id` + `status_since` (`current_date`), raises `barrier % does not exist` if missing, inserts history row. Last three params default for app-status callers. Sync writes preserve Fracttal creator (or requester fallback), people/roles, explanation, run id; `sync_run_id` + `barrier_id` joins history to sync audit row. Displayed author prefers `source_author`; `author_id` remains technical sync identity so admin-override guard keeps semantics. Fracttal names/roles and operation text exposed with authenticated barrier-history response and retained with that row; soft deletion keeps them, hard deletion cascades. `transitionBarrierStatus()` in `lib/server/sql/barriers.ts` calls exactly that function - only place in app code. Same-status calls no-op (no history row, no alert fan-out). Direct `UPDATE availability_id` rejected by `trg_guard_availability_write`; only `record_status_change()` (sets `app.status_write` first) may write. Manual repair possible by setting GUC first in same transaction. Exposed via `PATCH /api/barriers/:id/status` and modal Editar tab (`BarrierEditor`). Session admins may omit `authorId` (derived from user via `authors`); token callers keep explicit `authorId`. Only `admin` roles may write.

### Provenance + sync (P3)

`external_code` (UNIQUE, NOT NULL) upsert match key: dedup by constraint, not app logic. NULL forbidden (NULL-coded rows invisible to `loadLocal` and duplicate on next sync). `deleted_at` soft delete - items disappearing from Fracttal (scoped crawl) keep row and history, but `buildWhere`/`scopeText` and `chart.ts`/`vocabularies.ts` filter to admin-chosen `rowScope` (default `active`: `deleted_at is null and is_active`) instead of showing everything; dashboard Situacao filter (admin only) lists `inactive` (`is_active = false`), `deleted`, or `all`. `is_active` mirrors upstream `active` flag, never changes availability derivation. All 15 sheet inventory columns sync-owned (derived in `lib/server/fracttal/sheet-fields.ts`), so sync sweep backfills them on existing rows via signature change. `has_contingency` manual-safe (`coalesce($new, has_contingency, 'Não')`): auto-detected row writes `Sim` plus source snippet, rows without work-text signal keep manual values and otherwise default `Não`. `sync_state` records one row per run (inserts/updates/deletes/skips, `status`, `note`). `sync_barrier_changes` records one row per barrier touched (kind, old/new availability, `changed_fields`, compact old/new snapshots) so dashboard lists last-run/last-24h scopes paged and loads one barrier's before/after diff on demand. `UNIQUE(run_id, barrier_id)` + `ON CONFLICT DO NOTHING` makes audit retries idempotent. Catalog id allocation (`ensureCatalog`, `getOrCreateAuthor`) serializes `max(id)+1` with transaction-scoped advisory locks. One `running` lease per scope DB-enforced by `uniq_sync_state_running_scope` partial unique index; `startRun()` uses `ON CONFLICT ... DO NOTHING` against that index and maps empty insert result to `ScopeBusyError`, avoiding error-level logs for routine lease contention.

### Alerts (P5 + rules)

`alert_events` queues transitions allowed by rules: `dedup_key` (`barrier:date:status`, UNIQUE - rerun enqueues zero; stale reminders use `stale:rule:barrier:date`), `kind` (`barrier_transition` or `stale`), `sent_at` null until sent, `payload` with context (tag, installation, availability, criticality, `urgency`, `category`, `immediate`, `attempts`, `last_error`, `dead_letter`, `delivered[]` per recipient). `alert_recipients` (`email` UNIQUE, `name`, `active`) digest audience, managed by `/api/recipients*`. `phone` (digits, empty = email only) enables provider second channel, but only for uncontained unavailable landing (`violada`, status 5 via `whatsapp`); contained and degraded landings stay email-only. `alert_rules` defines triggers: per-category enable/disable (no active rule covering a category means that category never alerts), landing status, critical-only, recovery opt-in, stale days, immediate vs digest. Empty rules fall back to legacy behavior (every non-compliant landing alerts via digest). Cycle in `lib/server/alerts/run.ts` + `lib/server/alerts/rules.ts` (pure matching) + script `scripts/alerts-check.ts`.

### Auth (users + sessions)

`users` holds dashboard logins (`role` is `admin` or `user`; only admins manage users, recipients, rules, and barrier status). Passwords are PBKDF2-SHA256 (`lib/server/auth/password.ts`, no native deps). `sessions` holds opaque tokens (only SHA-256 hashes stored, 12h TTL); `POST /api/auth/login` sets the HttpOnly cookie, `GET /api/auth/me` reveals the role to islands, `POST /api/auth/logout` revokes, `POST /api/auth/password` changes the caller's own password (session-only, revokes every session). The admin-only `PATCH /api/users/:id` can reset any user's password (also revoking that user's sessions). Admin routes accept a session or `ADMIN_TOKEN`. The first user is provisioned from the CLI (`scripts/create-admin.ts`); the users route never self-registers, even on an empty table.

## Indexes

`location_id`, `availability_id`, `compliance_id`, `category_id`, `criticality_id`, `typology_id`, and `owner_id` have simple indexes - the fields that `BarriersQuery` filters on plus the `SORTABLE` owner sort (`idx_barriers_typology`, `idx_barriers_owner`, see DECISIONS.md#D01). `status_since` is also indexed, used by the "most urgent first" ordering (`sortCol=statusSince`). `tag` has a simple btree (`idx_barriers_tag`): equality and prefix use the index, `%q%` does a seq-scan - trigram (`pg_trgm`) was deliberately left out so the extension is not required (the schema drops the legacy name `idx_barriers_tag_trgm`). History has `idx_history_barrier(barrier_id, date)` plus `idx_history_date_id(date desc, id desc)` for the alert date-ordered scan and `idx_history_sync_author`. Sync lock queries use `idx_sync_state_scope_status(scope, status, finished_at desc)` alongside the existing status index. Alert scans use `idx_alert_events_transition` and `idx_alert_events_barrier_created`. Throttle sweeps use `idx_throttle_reset`.

## Demo data seed

`scripts/seed.ts` does not reimplement the mock data generation - it imports `getWireBarriers()` from `lib/data.ts` (the same deterministic generator that feeds the app's "mock" mode, implemented in `lib/mock/generator.ts`) and inserts the result into Postgres in batches of 500 rows (`BATCH_SIZE`), with `ownerId < 0 -> NULL` and `RETURNING id` preserving order for the history join. This guarantees the demo data in the DB is identical, id by id, to what the app would show in `PUBLIC_API_MODE=mock` - useful for comparing/debugging the two modes side by side. `scripts/migrate.ts` applies `db/schema.sql` + `db/seed_lookups.sql` with a splitter that respects dollar-quoted bodies (`$$`), quotes, and comments (including double quotes). `scripts/check-migration-order.ts` static guard: every index in `db/schema.sql` must follow its column (`CREATE TABLE` or an earlier `ALTER ... ADD COLUMN`), so a migration that works on a clean DB can never fail on a pre-existing one; runs in `deno task check`.

## Files in this layer

| File                               | Responsibility                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| db/schema.sql                      | Full DDL: tables, indexes, triggers (`trg_barriers_set_compliance`, `trg_barriers_updated_at`), functions (`barriers_set_compliance()`, `set_updated_at()`, `record_status_change()`)            |
| db/seed_lookups.sql                | Populates static lookups from `lib/enums/` (idempotent; locations/categories stay empty for sync)                                                                                                |
| scripts/migrate.ts                 | Applies the two files above against `DATABASE_URL` (pool size 1)                                                                                                                                 |
| scripts/check-migration-order.ts   | Static guard on migration order; runs in `deno task check`                                                                                                                                       |
| scripts/seed.ts                    | Populates barriers/barrier_status_history with mock data (batches of 500, `--force` truncates)                                                                                                   |
| lib/server/db.ts                   | Lazy server-only Postgres pool (`globalThis.__barrierPool`, `queryRows<T>`)                                                                                                                      |
| lib/server/sql/barriers.ts         | `listBarriers` (paginated+count), `getBarrierById`, `getKpi` (fixed + `GROUP BY` buckets), `transitionBarrierStatus`, `updateBarrier` (metadata+sheet fields)                                    |
| lib/server/sql/field-options.ts    | `field_option_sets` store (`list`/`upsert`/`seed` from GERAL extraction)                                                                                                                         |
| lib/server/sql/chart.ts            | `getChartData` (`GROUP BY category_id`, `compliant` + `total`)                                                                                                                                   |
| lib/server/sql/vocabularies.ts     | `getVocabularies()` (labels+counts, SSR seed via `routes/index.tsx` + `GET /api/vocabularies` refresh)                                                                                           |
| lib/server/sql/where.ts            | `buildWhere` (args `$n`, `escapeLike`), `resolveOrderBy` (whitelist `SORTABLE`)                                                                                                                  |
| lib/server/sql/sync.ts             | `defaultSyncIo` P3: label->id context, `loadLocal`, `startRun`/`applyPlan`/`finishRun` (upsert via `external_code` UNIQUE, `record_status_change`) + `syncScopeRunning` (poll lock, 10min stale) |
| lib/server/fracttal/map.ts         | Mapper P3: `mapAsset` (exact label->id resolution, skip+reason for unmapped), `availabilityFromAsset`, `IMPORT_DEFAULTS`                                                                         |
| lib/server/fracttal/sync.ts        | Orchestrator P3: `planReconcile` (pure), `runSync` (dry-run default), `fieldsSignature`                                                                                                          |
| lib/server/fracttal/runner.ts      | Poll P3: `pollOnce` (lock->run->notify), `createPollLoop` (cadence per scope, stop-safe)                                                                                                         |
| lib/server/fracttal/notify.ts      | Ops P3: `consoleNotifier` (always), `smtpEmailNotifier` + `smtpConfigFromEnv` (`OPS_SMTP_*`, `OPS_EMAIL_*`), `notifyFailureToAll` (best-effort)                                                  |
| lib/server/fracttal/smtp.ts        | Deno-native SMTP P3: EHLO, STARTTLS (reader released for `Deno.startTls`), AUTH PLAIN, dot-stuffing                                                                                              |
| lib/server/sql/mappers.ts          | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`, `toHistory`                                                                                                              |
| lib/server/config.ts               | `loadServerConfig` (http boot), `loadSyncConfig` (Fracttal credentials for scripts)                                                                                                              |
| lib/server/errors.ts               | `{error,code,requestId}` envelope + `x-request-id`                                                                                                                                               |
| lib/server/auth.ts                 | `checkAdminAuth` (Bearer `ADMIN_TOKEN`, fail-closed, with `role`)                                                                                                                                |
| lib/server/throttle.ts             | `createThrottle` (fixed window, no deps) + per-route buckets                                                                                                                                     |
| lib/server/exportRows.ts           | `resolveExportScope` (scope KPI) + `exportBatches` (5,000-row paged batches)                                                                                                                     |
| lib/server/exportStream.ts         | `textStream` (head/batch/tail skeleton shared by CSV format)                                                                                                                                     |
| lib/server/exportCsv.ts            | `streamExportCsv` (BOM + `row()` + `summaryRowsFrom()`)                                                                                                                                          |
| lib/server/exportXlsx.ts           | `streamExportXlsx` (workbook streamed out of ZIP writer, batch by batch)                                                                                                                         |
| lib/server/exportPdf.ts            | `streamExportPdf` (report streamed page by page, batch by batch)                                                                                                                                 |
| lib/server/sql/recipients.ts       | CRUD `alert_recipients` (pure validation + thin store)                                                                                                                                           |
| lib/server/sql/users.ts            | CRUD `users` (roles, last-admin guard, no hashes in JSON)                                                                                                                                        |
| lib/server/sql/sessions.ts         | Opaque `sessions` (hash lookup, revoke, expiry sweep)                                                                                                                                            |
| lib/server/sql/authors.ts          | `listAuthors` + `getOrCreateAuthor` (session -> author id)                                                                                                                                       |
| lib/server/sql/alert_rules.ts      | CRUD `alert_rules` + `listStaleBarriers` (time trigger)                                                                                                                                          |
| lib/server/auth/password.ts        | PBKDF2-SHA256 hash/verify + 12-char policy (WebCrypto only)                                                                                                                                      |
| lib/server/auth/session.ts         | Opaque token, SHA-256 hash, HttpOnly cookie builders                                                                                                                                             |
| lib/server/alerts/store.ts         | `AlertStore` contract (dedup, `delivered[]` per recipient)                                                                                                                                       |
| lib/server/alerts/detect.ts        | `detectUrgentTransitions` (history -> `isUrgent`, same predicate as dashboard)                                                                                                                   |
| lib/server/alerts/run.ts           | `runAlertCycle` (detect->enqueue->digest->mark, dry-run default, `--reprocess`)                                                                                                                  |
| lib/server/alerts/mailer.ts        | `AlertMailer` + SMTP provider (P3 reuse) + `sendWithRetry`                                                                                                                                       |
| lib/server/alerts/provider.ts      | Generic provider payload (`canal: email`/`whatsapp`/`internal`)                                                                                                                                  |
| lib/server/alerts/templates.ts     | Urgent digest pt-BR (subject counts criticals, body lists criticals first)                                                                                                                       |
| lib/server/sql/alerts.ts           | `sqlAlertStore` (`ON CONFLICT dedup_key DO NOTHING`, dead-letter in payload)                                                                                                                     |
| lib/dashboard/urgent.ts            | `urgencyOf`/`isUrgent`/`compareUrgency`/`urgentBarriers` (fail-closed baseline = NcAlert)                                                                                                        |
| routes/api/_params.ts              | Shared strict parsers (`parseInt`/`parseDate`/`parseQueryParam`)                                                                                                                                 |
| routes/api/barriers.ts             | `GET /api/barriers`                                                                                                                                                                              |
| routes/api/barriers/[id].ts        | `GET /api/barriers/:id`                                                                                                                                                                          |
| routes/api/barriers/[id]/status.ts | `PATCH /api/barriers/:id/status` (admin write + immediate fan-out)                                                                                                                               |
| routes/api/kpi.ts                  | `GET /api/kpi`                                                                                                                                                                                   |
| routes/api/chart.ts                | `GET /api/chart`                                                                                                                                                                                 |
| routes/api/health.ts               | `GET /api/health` (liveness, no DB)                                                                                                                                                              |

## SSO (Microsoft Entra ID)

SSO adds these columns and tables without removing the existing password model:

- `users.auth_source` (`local` or `entra`), `entra_tid`, `entra_oid`.
- `users.password_hash` is nullable for Entra users.
- `users_auth_source_valid` and `users_auth_source_shape` enforce local versus
  Entra rows.
- `idx_users_entra_identity` uniquely maps `(entra_tid, entra_oid)` for Entra
  users.
- `sessions.auth_method` (`password` or `entra`) and `idp_sid_hash`.
- `auth_flows` stores short-lived OIDC state, browser binding, nonce, and PKCE
  verifier hashes. Rows expire after the configured flow TTL.

Entra identity is `(tid, oid)`. Email, UPN, and `preferred_username` are never
used as identity. Entra users have no local password. Admin conversion preserves
`users.id` and authored history.
