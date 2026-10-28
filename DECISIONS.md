# Decisions

Append-only architecture decision records. Newest last.

## D01 - Feature-preserving database index pass (2026-10-08)

Context: massive query-optimization request; prior draft proposed limits that would remove features (pageSize clamp, history join, pg_trgm, unbounded truncation). Owner: drop anything limiting/removing a current feature.

Decision: additive-only speedups, no contract/cap/throttle/pacing change. Added plain btree indexes: idx_barriers_typology, idx_barriers_owner, idx_history_date_id, idx_alert_events_transition, idx_alert_events_barrier_created, idx_sync_state_scope_status, idx_throttle_reset.

Kept all existing caps and paths (pageSize 1..100000, 5000-row export batches, 200000 ceiling, throttle windows, record_status_change as sole status write, btree tag index with documented %q% seq-scan, pg_trgm out per docs/DATABASE.md).

Dropped: pg_trgm GIN, history-join removal, OFFSET-to-keyset without full sort coverage, silent row-dropping LIMITs, caching private rows.

Rationale: owner forbade feature removal; follow-ups must stay additive with docs updated in same commit. Verification: deno task check (includes migration-order guard).

## D02 - Read round-trip collapse (2026-10-08)

Context: dashboard fan-out runs list+count, KPI (5-6 scans), chart, vocabularies on every poll; no contract change allowed.

Decision: listBarriers carries total via count(*) OVER() on each row (one scan; out-of-range empty pages take one count query so totalPages exact). getKpi runs fixed-field aggregate plus one tagged UNION ALL bucket query (2 round-trips, 3 with admin scopeCounts), same filter subset, fail-closed NC definition per branch.

Rationale: cut scans without changing wire shapes, pageSize clamp, or scope gating. Verification: deno fmt --check, deno check, deno task test (576 passed; DB suites self-skip without DATABASE_URL).

## D03 - Atomic chunked sync apply with batched audit (2026-10-08)

Context: applyPlan ran N barriers x 2-3 sequential statements in autocommit; crash left half-applied runs; every audit row cost a round-trip. Bulk UNNEST rejected (bypasses record_status_change; unverifiable without live Postgres).

Decision: new withTx helper in lib/server/db.ts (single-connection BEGIN/COMMIT/ROLLBACK, guarded release, no stale retry). applyPlan commits in SYNC_APPLY_CHUNK=200 transactions with identical per-row SQL and record_status_change calls. Audit rows collect per chunk and insert in one multi-row statement after commit (best-effort preserved). Barrier-write failure fails run; audit failure never fails writes.

Rationale: atomicity plus fewer round-trips without bypassing sanctioned path. Verification: deno fmt --check, deno check, deno task test (576 passed).

## D04 - Sync-changes list round-trip collapse (2026-10-08)

Context: listSyncChanges ran standalone count plus page query sequentially (2 round-trips per header-page interaction).

Decision: same count(*) OVER() treatment as D02. Page-to-barrier joins are all to-one, so window total matches old count; out-of-range empty pages take old count query. Summary path (summarizeAuditRows) untouched (different joins, already parallel).

Rationale: halve round-trips with exact totals. Verification: deno fmt --check, deno check, deno task test (576 passed).

## D05 - Assessed and deferred (2026-10-08)

Context: items investigated but not changed; need live Postgres/app or owner authorization (agents.md section 12); blind changes risk silent drift against no-limits rule.

Decision: defer: getSyncStatus 4 parallel LIMIT 1 lookups (already parallel); summarizeAuditRows 3 parallel aggs; getVocabularies/getResolverLabels caching (needs ADR proving no cross-session leak); loadLocal OR-split (6.6ms once per cycle on 18k rows); alert countRuleEvents batching (39 candidates in seconds); ensureCatalog sequence/authors identity; upstream fetch concurrency; aggregate dashboard ETag endpoint and client 304 handling; export OFFSET-to-keyset (later D07); EXPLAIN baseline/load test (no DB reachable, secrets off-limits).

Rationale: no concrete benefit or unverifiable here. HTTP ETag server emission and export keyset completed later (D08, D07).

## D06 - Sync-status timestamp contract fix (2026-10-08)

Context: DB integration suite against populated docker DB exposed pre-existing failure: sync-status_test.ts:114 expects lastRun.finishedAt string, but driver returns timestamptz as Date.

Decision: normalize to ISO strings in getSyncStatus via new asIsoString helper. SyncStatus contract already declares strings; wire JSON serializes Date to same ISO form, so wire bytes unchanged; in-process shape now matches type. getLatestFinishedRun/getSyncRuns untouched (wire-serialized, no failing test).

Rationale: fix type mismatch without wire change. Verification: targeted DB suites plus full equivalent in tools container, 576 passed, 0 failed.

## D07 - Keyset export paging (2026-10-08)

Context: measured full-scope export walk on docker DB (13k rows): tag-ordered pages ~22s each (65s total) from OFFSET rescans plus full sort per page; id order 0.9s.

Decision: new listBarrierWindowAfter keyset cursor (sort value plus b.id tiebreaker) with row predicates keeping exact ORDER BY semantics, including NULL placement for nullable owner (ASC NULLS LAST, DESC NULLS FIRST). exportBatches full walks by cursor; offset windows keep stable OFFSET walk for print slices. listBarrierWindow kept for those callers. Fixed DESC NULL-to-value crossing and unused bind param before commit.

Rationale: cut 65s to under 2s. Verification: walk-equality over 10 sortable columns x both directions x unknown-column fallback on 13k rows (identical sequences; tag pages 70-250ms). export_window_test.ts passes (12 KST rows incl. null owners, limit 5, all sorts). Full suite 577 passed, 0 failed.

## D08 - Conditional GETs with body-hash ETags (2026-10-08)

Context: dashboard polls re-download unchanged JSON on every tick (sync-status 60s/15s, barriers/KPI/chart/vocabularies 5 min); no cache headers existed.

Decision: okWithEtag(req, data, requestId) in lib/server/errors.ts (SHA-256 over exact response bytes, Cache-Control private no-cache, 304 no body on matching If-None-Match), used by all 17 GET JSON handlers. Writes, export streams, time-varying /api/health untouched. private keeps authenticated bodies out of shared caches; per-request server validation keeps role-gated data correct. Client half done in same line: fetchJson revalidates per URL from bounded 50-entry per-adapter memory cache, serves 304s from memory, caches never cross adapters.

Rationale: save bytes on polls without limiting features. Verification: new errors_test.ts and http_test.ts cases; deno task check; full test on host and docker DB. Live 304 round trips not exercised (no valid credential without secrets).

## D09 - Duplication-guard hardening (2026-10-08)

Context: dedup review found six residual paths: retried same-status PATCHes appended duplicate history; single-write-path rule convention-only; sync audit retries could double-insert; catalog/author max(id)+1 allocation raced; running-lease claim raced under READ COMMITTED; nullable external_code rows invisible to reconcile.

Decision: DB enforcement first, app guards second: transitionBarrierStatus returns current row with no write on same status and PATCH early-returns before alert fan-out; trg_guard_availability_write rejects direct availability_id update unless record_status_change set app.status_write; uniq_sync_changes_run_barrier plus ON CONFLICT DO NOTHING in insertAuditBatch/recordBarrierChange; pg_advisory_xact_lock in ensureCatalog/getOrCreateAuthor; uniq_sync_state_running_scope partial unique index mapping to ScopeBusyError; barriers.external_code NOT NULL (DDL on clean DBs, idempotent ALTER, fail-closed on legacy NULL).

Rationale: close duplicate/inconsistency paths. Verification: new dedup_test.ts and dedup_integration_test.ts; deno task check; full test on host and migrated docker DB. Docs updated (DATABASE.md, ARCHITECTURE.md, readme.md).

## D10 - Central structured server logger (2026-10-08)

Context: logging scattered console.* with ad-hoc prefixes, no levels/timestamps/correlation/redaction.

Decision: new lib/server/log.ts (no new deps) as single server logging contract. Levels debug/info/warn/error plus audit (greppable info with audit=true); LOG_LEVEL (default info) and LOG_FORMAT=text|json env (.env.example); timestamp+scope+requestId on every line; debug/info to stdout, warn/error to stderr; key-based secret redaction ([REDACTED], narrow list so author never matches) plus postgres:// value redaction, truncation, circular guard, never-throw emits. child() binds scope/request context; line() adapts legacy callbacks; forRequest() binds same id as error envelope and x-request-id header. Migrated server core (errors, auth, db, sql/sync, fracttal notify/runner/cycle), request-scoped logging in two barrier write routes plus auth/me, structured line loggers in alerts-poll/alerts-check. CLI result output stays plain console.log; browser console.warn untouched.

Rationale: one consistent logging contract. Verification: new log_test.ts (15 cases); deno task check; full deno task test.

## D11 - Contingency derivation from work text plus manual sheet flag (2026-10-16)

Context: 20k Fracttal-imported barriers showed zero contingency rows; two Contingenciado states (ids 2/3) existed but no code path produced them (resolveAvailability only emitted 0/1/4/5; import/sync never wrote has_contingency). Dump census found zero explicit contingency hits, so signal had to be defined.

Decision: two sources promote to same states. Auto: open corrective work whose free text matches contingenc, a GM-... evidence code (or bare GM), or CEC token (isContingencyText/hasContingencySignal scanning description plus task notes, labels, custom status) promotes 4->3 / 5->2 at derivation time and writes has_contingency='Sim' plus source snippet; preventive notes inert. Manual: stored 4/5 with sheet Sim read as 3/2 everywhere (effectiveAvailabilityId in resolveBarrier plus same CASE in KPI/chart/vocabulary/filter SQL), and PATCH /api/barriers/:id materializes overlay to stored 2/3 via second record_status_change() (explicit availabilityId wins). Sync preserves manual flags (coalesce($new, has_contingency)) and never clears them; admin-owned statuses keep override guard. Compliance trigger stays base-only; all reads derive effective compliance.

Rationale: define contingency signal from existing data without changing compliance trigger. Verification: unit tests for flag/text/signal helpers, overlay, work-slot flagging, mapAsset promotion, resolveBarrier promotion; live-DB checks (filter availabilityId=3 finds 4+Sim rows, KPI/chart compliant+1 with total unchanged); full deno task test (592 passed). Docs updated (ARCHITECTURE, API, DATABASE, FRACTTAL-DATA, readme).

## D12 - Provider second channel is whatsapp, not messaging (2026-10-16)

Context: homologation measured whole-payload 422 canal_nao_aceito on every violada alert with a phone-carrying recipient: provider accepts only email, whatsapp, internal, but payload sent canal "messaging"/canais ["email","messaging"]. Hidden until a second recipient with phone registered (second channel only attaches for status 5 with phone).

Decision: send canal "whatsapp"/canais ["email","whatsapp"] (lib/server/alerts/provider.ts); internal withMessaging field name and test titles kept (never hit network). Docs updated (API, DATABASE provider rows plus fan-out notes). Deploy note: routes/api/barriers/[id].ts and [id]/status.ts import provider for immediate fan-out, so app service needs redeploy too, not just poller scripts.

Rationale: fix rejected provider channel. Verification: deno test lib/server/alerts/ (37 passed), full deno task test (592 passed), homologation A/B (422 vs 202) plus --apply --reprocess --only-barrier 427 delivering 4 dispatches.

## D13 - Sheet inventory columns are sync-owned and never blank forever (2026-10-26)

Context: barrier details modal rendered several GERAL inventory fields as "Não informado" forever because import wrote nulls and sync never touched them.

Decision: all 15 sheet columns plus action_plan derived from Fracttal asset fields, maintenance plan metadata, notes, open work via lib/server/fracttal/sheet-fields.ts, shared by dump import and live sync. has_contingency remains manual-safe via coalesce($new, has_contingency, 'Não'); every other column overwritten each sweep. owner_id and grouping_id derived heuristically instead of hardcoded defaults. Preventive open work drives plan_followed only and never availability. extra_comments always has field_1-based fallback so never empty.

Rationale: make inventory fields populated and sync-owned. (No separate verification line in original beyond docs.)

## D14 - DEV-gated raw Fracttal detail inspection (2026-10-26)

Context: admins need to compare modal values with upstream asset and related work rows while developing in HTTP mode.

Decision: DEV=true enables on-demand raw-data panel for admins only. Server resolves selected barrier ID to stored external_code; clients cannot choose arbitrary upstream code. Fetches raw item plus code-filtered work orders/requests, returning original fields only for exact-code matches. Related endpoints capped at five 100-row pages each, with excluded-row and truncation indicators. API read-only, rate-limited 5 req/address/min, returns private no-store; raw payloads not logged/cached/persisted. Existing Fracttal adaptive pacing and GET-only behavior remain. Upstream basis: docs/FRACTTAL.md lists GET /items/{code}, code_asset for work orders, code_item for work requests; official docs endpoint could not be fetched during implementation and no live tenant request made, so filters remain unverified against connected tenant.

Rationale: safe dev-only upstream inspection. (No verification line beyond checks.)

## D15 - Quiet handling of concurrent sync lease claims (2026-10-26)

Context: concurrent pollers correctly left one sync_state lease owner, but losing insert still raised PostgreSQL unique-constraint error appearing in Docker logs despite being caught as normal contention.

Decision: retain uniq_sync_state_running_scope as DB authority and use ON CONFLICT (scope) WHERE status='running' DO NOTHING in startRun(). Empty result maps to ScopeBusyError, preserving skipped poller behavior without logging routine collision as DB error.

Rationale: quiet normal contention. Verification: DB integration test races two lease claims asserting one owner plus one ScopeBusyError (self-skips when DATABASE_URL unset); deno task check and deno task test after change; race test needs migrated Postgres schema.

## D16 - Align Fracttal detail derivations with asset hierarchy (2026-10-26)

Context: review of barrier 1009435 found trailing asset leaf shown as its own installation location, SGI-LEC source references fell back to generic program origin, open-work trade overrode stable valve ownership, same work description appeared under both Degradação and Comentários.

Decision: derive install_local from closest parent above matching asset leaf; recognize SGI-LEC references in notes; resolve owner from asset family before using open-work trade as fallback; omit Comentários when text duplicates Degradação. Clarify plan_followed concerns overdue preventive tasks only; corrective work does not change that field. Keep existing status date and history behavior unchanged.

Rationale: fix observed display errors. Verification: add sanitized synthetic mapping tests (asset hierarchy, SGI-LEC origin, valve owner with Instrumentação corrective work, unknown-family trade fallback, preventive-only plan semantics); modal rendering regression test for duplicate comments and clarified label; run deno task check, deno task test, deno task build.

## D17 - Attribute and explain sync-generated status history (2026-10-27)

Context: status history recorded sync service as author and generic sync note, while per-barrier sync audit separately held status diff. Anonymized Fracttal work-order shape confirmed created_by, requested_by, personnel_description, user_assigned, resources_human_resources, validated_by_description.

Decision: for new sync-generated history, display created_by as author and fall back to requested_by. Snapshot people and roles from those Fracttal fields; explain winning status signal using classification, reference, notes, contingency/out-of-service evidence; store sync_run_id so (sync_run_id, barrier_id) joins to per-barrier audit. Existing author_id remains sync identity (status ownership and admin-override detection depend on it). If Fracttal provides no person, existing technical author remains visible. Existing history not backfilled. Work-request actor-field parity remains optional until observed. Name/role snapshots and source explanation retained with existing status-history row lifecycle and returned under same barrier read authorization; no new audience or retention. Fracttal operation text may contain identifying free text, preserved only when new sync status entry written. These sync names/notes not copied into alert emails; sync remains identified as source in that channel.

Rationale: attribute sync history to actual person and explain signal. Verification: deno task check, import-order check, deno task test (616 passed; DB integration self-skipped because DATABASE_URL unset), deno task build passed. Schema apply and Postgres integration test not possible without disposable DB; no live sync run.

## D18 - Explicit barrier contingency links (2026-10-27)

Context: operators need to identify barrier tag backed by each contingency barrier, review reverse relationships, see Gestão de Mudança and Análise de Risco references, and know when a non-compliant barrier has no eligible contingency. Existing has_contingency and contingency_desc do not encode barrier-to-barrier relationships.

Decision: store links in separate many-to-many barrier_contingencies table with optional text refs per link. Candidate must be active, not deleted, same location, exactly Disponível, and compliant; server rechecks rule while locking both barriers before creating link. Keep existing links if later changes make them ineligible; admins review all links, other users see links to active non-deleted barriers. Any authenticated user can read; admins alone create/update/remove. For a Não Conforme barrier with no currently eligible outgoing link, show text-only recommendation to put it out of operation. Never change status from this feature. Mock mode does not pretend in-memory relationship persisted.

Consequences: upstream sync does not own or clear these local relationships. Endpoint returns at most 50 candidate tags per search and signals more results so operator can refine by tag. Management Change and Risk Analysis are references, not uploaded documents or links.

Rationale: encode barrier-to-barrier contingency relationships. Verification: deno task check, deno run -A scripts/import-sort.ts, deno task test (620 passed; Postgres integration skipped because DATABASE_URL unset), deno task build passed. Schema apply and Postgres integration test not possible without disposable DB.
</content>
