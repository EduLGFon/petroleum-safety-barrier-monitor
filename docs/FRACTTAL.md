# Fracttal safe-harbor spike (P2)

> Read-only. Never writes to prod. Fixtures replay from `scripts/fixtures/`.
> Source: official Fracttal docs (api.fracttal.com) captured 2026-09-12;
> verified against the documented contract only. Tenant credentials are
> production-only; `DEV=true` enables an admin-only, bounded, on-demand
> raw detail GET in the HTTP-mode barrier modal.

## Safe-harbor rules

- Only GET endpoints; client module refuses non-GET verbs (`client.ts` `verbs`).
- Credentials from env (`FRACTTAL_KEY`/`FRACTTAL_SECRET`), never committed.
- Capture runs bounded: one `location_code`, capped pages (default 1, up to 100 items). Replay fixtures, never prod.
- Modal raw-detail GET: one selected item plus up to five 100-row pages each of work orders and requests using `code_asset`/`code_item`; only exact-code rows returned, truncation flagged. Requires `DEV=true` + admin credential, shared read-only client/rate bucket, never persists or logs raw bodies.
- Ops contact for real calls reviewed and rate-limit aware (200 req/min per IP).

## Endpoints used

| Method | Path | Purpose | Key params |
| GET | `https://app.fracttal.com/api/items` | Asset list (barrier feed; swept unfiltered) | `code`, `id`, `item_type` (1 Locations, 2 Equipment, 3 Tools, 4 Spare Parts, 5 Digital), `location_code` (parent code; children only; verified live: station codes 400, values are group/asset tags, no station scoping), `active`, `available`, `field_1`-`field_6`, `start` (0-based), `limit` (default 100, max 100) |
| GET | `https://app.fracttal.com/api/items/{code}` | One asset by code (targeted verification; missing code resolves null) | path `code` |
| GET | `https://app.fracttal.com/api/work_orders` | Task rows in WOs (WO status feed; rows are task-level) | `folio`, `ot_status` (1 in process, 2 review, 3 completed, 4 cancelled; verified: ot1=3,736, ot2=883, ot3=107,402), `code_asset`, `code_location`, `start`, `limit` |
| GET | `https://app.fracttal.com/api/work_requests` | Work requests (supplementary signal) | `code`, `id_status` (1-13), `code_item`, `code_creator`, `start`, `limit` |
| GET | `https://app.fracttal.com/api/transactions_log` | Asset change feed (probed, not consumed) | `module=1` Assets, `action` (ADD/EDIT/DELETE), newest-first, `limit`; `description` carries `TAG - desc { code }`; `data_action` object (keys unprobed). No `start` documented; `since` unprobed (avoid: `since` hangs `work_requests_status`) |
| GET | `https://app.fracttal.com/api/items_availability` | Out-of-service history (probed, not consumed) | `code`, `since` (defaults 30d back), `until`, `type_date`, `start`, `limit`; rows carry `code`, `initial_date`, `final_date` (2,407 records live) |
| POST | `https://one.fracttal.com/oauth/token` | OAuth2 client-credentials token | `grant_type=client_credentials` / `refresh_token` (+ HTTP Basic `key:secret`) |

Live findings 2026-09-20 (read-only probes): `since` on `/work_orders` is ignored (full-format `since` returns unfiltered total 121,206), so the status pass is newest-N-pages or the open-status sweep, never a date window. `total` present on swept endpoints (18,254 equipment; ot1 3,736; ot2 883). Station codes are NOT valid `location_code` values (400 "not found in your company"); live asset `location_code` values are group/asset tags, so station filtering is client-side from `parent_description`. `GET /work_requests_status` with `since` hangs (>20s); without `since` it answers but offers no safe windowing.

Response envelope for `GET /items`: `{ "success": true, "message": "200", "data": [ ...assets... ], "total": 173 }`. `data` may be an object or absent on some referential endpoints; client normalizes `data: []`. Neo limits: at most 100 records per query; paginate with `start` += `limit`.

## Limits seen

- 200 requests / minute / IP. Exceeded returns HTTP `406` ("Maximum number of request exceeded"); wait 60s (or honor reset header). One poller only: limit is per egress IP, so a second poller spends the same budget twice; the DB lock prevents overlapping runs but not doubled throughput.
- Header spelling differs by doc language: Spanish `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`; English `Request-Call-Limit`, `Request-Call-Limit-Remaining`, `Request-Call-Limit-Reset`. Client accepts both spellings on the 406 path. Reset means seconds left in the current period; the remaining description contradicts itself and window type (fixed vs sliding) is undocumented, so the client paces with an adaptive token bucket (initial 180/min, max 190, burst 10; `lib/server/fracttal/adaptive-rate.ts`): clean traffic inches up, low `ratelimit-remaining` or 406/429/5xx cuts the rate.
- Token life: 2h (`expires_in: 7200`), cached and refreshed once on `401`. A dead `refresh_token` grant falls back to `client_credentials` (drops stale refresh token) so one bad refresh cannot wedge later cycles. Whether token calls share the 200/min budget is undocumented; bucket margin covers it.

## Provenance design

Goal: every DB row traceable to its Fracttal source, every sync run auditable, deletions soft.

- `barriers.external_code` (text, UNIQUE, nullable): Fracttal asset `code`. Upsert matching key (not `id`: Fracttal ids are tenant-local and unreadable; `code` is the stable business key).
- `barriers.source_updated_at` (timestamptz, nullable): best available remote modification signal. Gap: `GET /items` does not return a last-modified timestamp in the documented shape, so it stays null until a real capture shows an `updated`-like field.
- `barriers.deleted_at` (timestamptz, nullable): soft delete. Items missing from Fracttal (full-scope crawl sees none for that `external_code`) set `deleted_at`; row stays so history/audit survives. `is_deleted` derived = `deleted_at IS NOT NULL`. Default dashboard views filter it out; retired rows auditable via `GET /api/barriers/deleted` (admin token).
- `sync_state` table: one row per run: `id, started_at, finished_at, scope (location_code), cursor (start), counts (insert/update/skip/error), status (running/ok/failed), note`. Ops diagnosis + rerun pointer; no secrets.
- Reconcile rule: within a scope, an asset present locally but absent from the remote page set is deleted (soft). Assets matched by `external_code` update in place; new codes insert; unmapped status values are listed, not guessed (see mapping).

## Mapping (Fracttal -> app enums / wire types)

Single source of truth: `lib/server/fracttal/barrier-rules.ts` (pure, tested). Dump import (`scripts/fracttal-import.ts`) and live sync (`lib/server/fracttal/map.ts`) both call it, so scope, station, typology, tags, and availability can never diverge. Precedence: import owns full catalog rebuilds (deterministic ids); sync creates missing locations/categories rows between rebuilds (ids continue past max(id)), so tenant drift converges on the next cycle instead of skipping.

App models barriers with `availability`, `compliance`, `criticality`. Fracttal assets expose `active` and `available` plus operational fields; there is no direct compliance field, so compliance stays derived (never written) on both sides.

| App concept | Fracttal source (both paths) | Notes |
| `externalCode` (new wire field) | `code` | Upsert match key |
| `availability` | `resolveAvailability`: urgent WO/WR event -> 5; planned -> 4; `stop_assets`/`initial_date_out_of_service` -> 1; `available:false` -> 5; else 0 | Work events from open-status WO sweep + windowed WR pass (merged per code by `buildWorkEvents`); import merges dump events the same way |
| `compliance` | derived: open/corrective work order on the asset - endpoint TBD | Unmapped: needs work-order contract + fixture review |
| `criticality` | `criticalityLabelFor`: `groups_2 = 'ESO'` flag wins, else TAG suffix letter (`... { code } A/B/C/D`), else `priorities_description`, else rank D + warning | ESO > A > B > C > D ranks; ESO/A are critical tiers; listed in run report (`mappingWarnings`), never a silent guess |
| `category` | `groups_description` taxonomy label (both paths; `groups_1_description` is the polo, never consulted) | sync creates missing rows between rebuilds (ids past max(id)) |
| `location` | L2 station parse of `parent_description` (both paths), `location_code` fallback for parent-less rows | station grouping; sync creates missing stations. `STATION_OVERRIDES` corrects known misparses (Base Seacrest - Sao Mateus-ES -> SM; the -ES is the state suffix) |
| `tag` (barcode label) | `description` falling back to `code` | display tag |
| excluded rows | none - upstream rows enter 1:1, mislabels included | curation happens in Fracttal; a fixed label arrives as a normal update |

Unmapped values are listed explicitly in `scripts/fixtures/README.md` and in the capture report (count per unrecognized `groups_*`/`priorities` value): ids needing new enum rows are derived from that list, never guessed.

## Capture procedure (prod tenant, reviewed)

1. `FRACTTAL_KEY`/`FRACTTAL_SECRET` in env (never committed).
2. `deno run -A scripts/fracttal-capture.ts --location-code <X> --pages 1` -> writes anonymized page set to `scripts/fixtures/fracttal-assets-sample.json`.
3. Review report: totals, unmapped values, anomalies.
4. Commit as the P2 fixture; P3 replays it (never calls prod from CI).

## Sync service (P3, as-built)

Pipeline: open the `running` audit row -> fetch source rows -> parse (`parsePage`, malformed listed) -> map (`mapAsset`, label->id exact resolution, skip+reason on unmapped) -> pure reconcile plan -> apply (or dry-run report) -> close the `sync_state` audit row. The running window covers fetch+apply (callers keep fetching lazy inside the source closure; only the work pass stays eager so its failure aborts with zero writes).

- `lib/server/fracttal/map.ts` - `mapAsset` (scope filter, exact label->id resolution, criticality default + warning, typology derived from parent chain, `MapOptions.work`/`today` for events and deterministic runs) + `availabilityFromAsset` (asset-flag-only wrapper). Unmapped labels listed in run report, never guessed.
- `lib/server/fracttal/sync.ts` - `planReconcile` (pure) + `runSync` (orchestrator). Change detection via stored `signature` (ORDER IS PART OF THE CONTRACT). Dry-run is default; nothing written without explicit flag. Restores reappearing rows, flags `statusChanged` on availability flips. `SyncOptions.workEvents` carries prebuilt per-code work signals into `mapAsset`; caller fetches them BEFORE runSync starts, so a work-endpoint failure aborts with zero writes (fail-closed).
- `lib/server/fracttal/work.ts` - live work signals: `parseWorkOrder`/`parseWorkRequest` validators, `workOrderSlot`/`workRequestSlot` (same open/closed gates and classifiers as import), `buildWorkEvents` (per-code merge; malformed rows listed, never thrown), `resolverFor`. Work-order history attribution reads `created_by` (then `requested_by`) and snapshots names from `personnel_description`, `user_assigned`, `resources_human_resources`, and `validated_by_description`; request rows use those fields only if present. `source_updated_at` is the winning work-event date, else the out-of-service date, else null.
- `lib/server/sql/sync.ts` - default `SyncIo`: builds label->id context from lookup tables, loads scoped locals, applies plan (inserts via `INSERT ... ON CONFLICT (external_code) DO NOTHING`; UNIQUE constraint is dedup authority; status changes go through the one sanctioned `record_status_change()` with author 10 as technical sync identity). New sync history snapshots the Fracttal creator (requester fallback), participants and roles, explanation, and `sync_run_id`; history plus barrier id joins to the per-barrier run audit. History UI displays the Fracttal person as author while retaining technical author id for the admin-override guard. `startRun` is an atomic claim (`INSERT ... WHERE NOT EXISTS` a fresh lease plus `ON CONFLICT ... DO NOTHING` against the partial unique index) so two racers cannot both open a run; loser gets `ScopeBusyError` without a PostgreSQL error log. Every live run heartbeats `finished_at` forward every 60s (`touchSyncRun`), so liveness rides the heartbeat, never `started_at`; a slow-but-alive sweep cannot reap itself or expire its own lock. Also exposes `syncScopeRunning(scope, staleMinutes=10)` as the poll lock: true while a `running` row for the scope holds a fresh heartbeat, so a crashed run only blocks polls for the stale window instead of forever.
- Sync failures never go silent. `scripts/fracttal-sync.ts` notifies ops on every failure (loud stderr line via `consoleNotifier` plus optional ops email) and exits non-zero; the `failed` audit row is still written first, so the DB agrees with the alert. Separate from barrier alerts (P5 `alert_events`), which stay untouched.
- `lib/server/fracttal/smtp.ts` - small Deno-native SMTP submission client (EHLO, optional STARTTLS upgrade, AUTH PLAIN, MAIL/RCPT/DATA with dot-stuffing, QUIT). No external dependency: the reader is released before `Deno.startTls` takes the socket.
- `lib/server/fracttal/notify.ts` - `OpsNotifier` list, `smtpEmailNotifier` plus `smtpConfigFromEnv()` (`OPS_SMTP_HOST` + `OPS_EMAIL_TO` required; port 465 means implicit TLS), and `notifyFailureToAll` which is best-effort: one failing channel never blocks the others.
- `lib/server/fracttal/runner.ts` - `pollOnce` (scope lock -> run -> notify on failure) and `createPollLoop` for single-scope operation: a single crashed tick (lock query down, upstream down) is reported and cadence continues; lease contention (`ScopeBusyError` from the atomic claim) maps to `skipped` with no ops notification; `stop()` is stop-safe.
- `lib/server/fracttal/cycle.ts` - `createCycleLoop`: tenant-global work pass fetched once per cycle and shared, sweep runs under one `fracttal-live:all` scope, next cycle chains after completion so a slow cycle can never overlap itself. A fetch failure is notified and the cycle continues next round. `stop()` waits for in-flight run. The `syncScopeRunning` lock stays as the multi-instance overlap guard. `scripts/fracttal-poll.ts` wires it: pause between cycles (`FRACTTAL_POLL_SECONDS`, default 300, min 5), adaptive throughput (initial 180, max 190, burst 10) and fetch fan-out (`FRACTTAL_FETCH_CONCURRENCY`, default 4), graceful SIGINT/SIGTERM shutdown that waits in flight. The `done` line carries the cycle total. The poller runs the same image as the app: rebuild + recreate it on every sync-code change (stale poller reconciles with outdated mapping and can mass-retire rows a remap just moved; verified live 2026-09-20).
- History rule: history appends only on a real status change. Freshly imported rows get one stamp (`Importado do Fracttal`), so the timeline is never empty.
- Deletion rule: locals absent from the sweep (and not already deleted) are soft-deleted (`deleted_at = now()`). The sweep covers the whole tenant, so one cycle reconciles every station at once. An asset that moved stations reconciles as an update, never delete+insert: `loadLocal` matches by station scope OR upstream code, so the old row is touched instead of retired while the "insert" would die on the UNIQUE constraint.
- Manual edits: dashboard status writes (`PATCH /api/barriers/:id/status`) are ephemeral for synced rows - the next cycle reverts any edit that disagrees with the Fracttal derivation (verified live 2026-09-20: 7 test edits reverted to Disponivel). Keeping a manual override past the next sync needs a pin mechanism (not built).
- `sync_state`: `status` (`running/ok/failed`), counts (`inserts/updates/deletes/skips`), `scope`, `note`. Skips total always reconciles to (malformed + unmapped + planned skips), so the row sums with the run report. `note` carries a compact run summary via `buildRunNote` (parsed/malformed/mapSkips/warnings + plan counts + first skip reasons, capped at 500 chars), so a scope is diagnosable from SQL alone - the fallback while no ops email is configured.
- `alert_events`: consumed by the P5 alert cycle (`scripts/alerts-check.ts`): dedup on barrier + transition date, `sent_at` null until sent. The sync pipeline itself still records transitions in `barrier_status_history` only; it never enqueues alerts.

Run shapes:

```
// fixture dry-run (default; needs DATABASE_URL for local reconcile)
deno run -A scripts/fracttal-sync.ts --fixture scripts/fixtures/fracttal-assets-sample.json
# same but writing
deno run -A scripts/fracttal-sync.ts --fixture <path> --apply
# fixture plus the work-order status pass
deno run -A scripts/fracttal-sync.ts --work-fixture scripts/fixtures/fracttal-work-sample.json
# live full sweep, reviewed prod session only (default dry-run, ~200 requests)
deno run -A scripts/fracttal-sync.ts --live --scope backfill:all --dry-run
# same with the open-status work sweep (default on; --work-windowed for the newest window)
deno run -A scripts/fracttal-sync.ts --live --dry-run --work-windowed
# polling cycle (env-driven; needs FRACTTAL_KEY/SECRET + DATABASE_URL)
FRACTTAL_POLL_SECONDS=300 deno run -A scripts/fracttal-poll.ts
```

The live status pass runs in open-only mode by default: it sweeps each open `ot_status` (1 in process, 2 review) to completion within the item page cap and shares the merged per-code signals across the run. Every open corrective WO is visible every cycle regardless of age, and completions/cancellations correctly vanish from it. Verified live 2026-09-20: the sweep returns exactly ot1 (3,736) + ot2 (883) = 4,619 rows, and the windowed mode missed 71% of status-affecting open work (+108 changes surfaced by the sweep, all toward degraded/out-of-service - the window had decayed them). Matches to barriers are by asset code. `FRACTTAL_WORK_OPEN_ONLY=0` (or `--work-windowed`) falls back to the newest `FRACTTAL_SYNC_WORK_MAX_PAGES` window per endpoint, which only sees recent work. Requests stay windowed in both modes (no open-only filter is documented for them). Truncation never aborts (missing work only misses signals, never deletes): a truncated open sweep warns loudly (old open work goes invisible, statuses may decay), while requests windowing is the normal state and stays info-level.

Request close-outs treated as closed: 4 solved, 5 cancelled, 6 solved via WO, 12 rejected (dump-observed) plus 11 removed from pending tasks (reference: Query status changes from requests). Status 9 (WO cancelled) deliberately stays open: the underlying need may persist, and a sticky signal beats a silent decay.

## Import vs sync precedence (both live, scoped)

| Concern | Import rebuild (`--apply`) | Live sync (between rebuilds) |
| locations/categories rows | creates from dump taxonomy (code/type/display name; operator list supersedes derived names) | creates missing rows between rebuilds (ids past max(id), names write-once); unresolvable rows still skip + list |
| barrier set | truncates + rebuilds (all equipment + exclusion list; admitting gates recorded per row in `scope_source`) | upserts by `external_code`, soft-deletes sweep-absent |
| availability | full dump WO/WR merge | asset flag + open-status WO sweep + windowed WR pass |
| `tag`/typology | derived from description / parent chain | same rules; updates applied on change |
| criticality | TAG suffix letter + `groups_2 = 'ESO'` flag (shared `criticalityLabelFor`) | rank ESO > A > B > C > D; ESO/A critical |
| history | one import stamp per barrier | appends on real change via `record_status_change()` |
| audit | one `dump-import` row | per-scope `running/ok/failed` rows |

Rebuild when: a new dump arrives, the taxonomy needs an overhaul, or a backfill must reconcile every scope (see below).

## Sweep and backfill procedure

One shared assembly (`fetchScopeSignals`, split into `fetchItemSignals` + `fetchWorkSignals` for the cycle) drives every live run: the full equipment set sweeps unfiltered (server-side station scoping does not exist - `location_code` values are group/asset tags, never station codes; verified live 2026-09-20, when station codes 400'd and group codes matched nothing useful), item pages fetch concurrently (default 4, in page order) to the envelope total (`FRACTTAL_SYNC_MAX_PAGES`, default 200 x 100 rows), `assertCompletePage` throws on any truncation, and the work pass merges after the guard. A truncated sweep or a work-endpoint failure aborts before `runSync` with zero writes; a too-small page cap fails loudly (raise the cap and rerun, never bypass the guard). Throughput capped by the client's adaptive token bucket (initial 180/min, max 190, burst 10).

Rate math (one sweep): tenant holds ~18,254 equipment items today (~183 pages), plus the open-status WO sweep (ot1 3,736 + ot2 883 = ~47 pages) and the windowed WR pass (2 x `FRACTTAL_SYNC_WORK_MAX_PAGES`, 10 at the default 5), plus the occasional token refresh - roughly 240 requests per cycle. Every GET passes one adaptive bucket starting at 180/min (max 190, floor 80, burst 10); pages fetch concurrently (`FRACTTAL_FETCH_CONCURRENCY`, default 4, reassembled in page order) with no threat to the ceiling under either fixed or sliding server windows; 406/429 backoff stays the server-side safety net. Fetch phase lands around 1-2 minutes, and with the default 300s pause the tenant refreshes roughly every 6-8 minutes including DB apply time. Minimum viable: a 60s pause (about 3 min freshness). Live proof: three full dry-runs moved ~195-245 requests each with zero 406s.

What was deliberately not done yet: delta sync is impossible on documented `/items` params (no since/updated filter, no sort, no field selection - verified against the official reference 2026-09-20, and `since` is ignored live), so full-page sweeps stay; change-feed endpoints could demote sweeps to rare reconciliation but need client work first (see Out of scope). An `active=true` server filter would cut ~29% of pages but changes sync semantics (inactive rows sync as normal barriers today), so it stays a live probe, never a blind change.

Backfill after an outage or before trusting the sweep:

1. `deno run -A --env-file=.env scripts/fracttal-sync.ts --live --scope backfill:all --dry-run` (report only; aborts loudly when truncated; ~240 requests over ~2 min).
2. `deno task fracttal:audit` (read-only station check, ~183 requests): per-station live-vs-DB table plus unknown stations and unmapped categories with sample codes. Exits 1 on red flags - a DB station with zero live rows, or unknown stations carrying barrier-scope rows (check order guarantees those passed the scope filter, so none is a false alarm) - investigate those before applying; unmapped categories never block (row-level, listed).
3. Rerun step 1 with `--apply`; confirm `sync_state` shows `ok` with deletes near zero.
4. Reconcile against the import baseline per station: `select l.code, count(*) from barriers b join locations l on l.id = b.location_id where b.deleted_at is null group by l.code order by 2 desc;`

## Open-only work pass (verified live 2026-09-20, default on)

The `ot_status` filter works exactly as documented (ot1 = 3,736 rows, ot2 = 883; ot3 = 107,402 proves it filters). A full-sweep dry-run diff showed:

- windowed: `u:43`, availability `{0:10, 1:25, 4:7, 5:2}`, 500 + 500 work rows
- open-only: `u:151`, availability `{0:9, 1:113, 4:27, 5:3}`, 4,619 + 4,000 work rows, inserts/deletes identical (1/8)

The window had decayed 108 barriers with genuinely open corrective work (mostly long-running stop-asset WOs surfacing as Fora de Operacao). The sweep costs ~50 extra requests per cycle - affordable inside the bucket. `FRACTTAL_WORK_OPEN_ONLY=0` (or `--work-windowed`) restores the newest window; requests stay windowed in both modes.

## Out of scope here

- Webhook receiver: investigated 2026-09-20, verdict not-supported. No webhook/push mechanism in official Fracttal One API docs (api.fracttal.com documents REST integrations only: read, insert, update), and searching for a Fracttal CMMS webhook surfaces only unrelated vendors. Polling stays the mechanism; revisit with a signature-checked receiver only if the vendor ships push. The poll cycle (one shared work fetch, full sweep, completion-chained cadence) is the standing answer to "almost real-time".
- Change feeds (probed live 2026-09-20, client work not started): `GET /transactions_log/` answers with newest-first rows (`limit` honored: 3 of 15,736 EDITs on `module=1`), and `description` carries `TAG - desc { code }` - asset code extractable for targeted `GET /items/{code}` refreshes, which would demote full sweeps to rare reconciliation (intersect log codes with tracked `external_code`s first; ADDs need a bounded new-code path). Still unknown: `data_action` object keys and `start` paging support. `GET /items_availability/` answers (2,407 out-of-service records with `code`/`initial_date`/`final_date`) - a direct Fora de Operacao signal that today comes only from the sparse `initial_date_out_of_service` field; the `code` filter returned empty for a currently-available asset (no history or unsupported filter - unconfirmed). `GET /work_requests_status/` answers WITHOUT `since` but hangs (>20s) WITH it - rejected as a feed; WRs stay windowed via `/work_requests`.
- WR open-sweep (fetch per open `id_status` like the WO open sweep): seven open values make it 7+ queries per cycle for a signal the dump showed at zero open rows on barriers. Revisit if live WR volume matters.
- A real fixture (needs prod access) - captured by the procedure above.

## Ops without email (current state)

No `OPS_SMTP_*` is configured, so the console `[ops]` line (collect with `docker compose logs poller`) plus `sync_state` rows are the failure channels. Triage from SQL:

```sql
-- recent failures (durable record; the alert cycle never sees these)
select scope, status, note, started_at, finished_at from sync_state
 where status = 'failed' order by id desc limit 10;
-- per-run health at a glance (note carries the buildRunNote summary)
select scope, status, inserts, updates, deletes, skips, note, finished_at
 from sync_state order by id desc limit 5;
-- a scope stuck 'running' past the heartbeat window (crashed poller?
-- liveness rides finished_at, rewritten every 60s while a run is alive)
select scope, started_at, finished_at as last_heartbeat from sync_state
 where status = 'running' and finished_at < now() - interval '15 minutes';
-- rows whose note starts with 'reaped:' are orphan cleanups (previous poller
-- died mid-sweep, next startRun reaped it), not real fetch/map/apply errors;
-- the dashboard shows them amber as Interrompida, never red.
```

## Sheet inventory field sources (GERAL)

Every barrier sheet column is now sync-owned and derived from Fracttal so no modal field stays blank forever. The dump import and the live sync use the same `deriveSheetFields`/`ownerIdOf`/`groupingIdOf` helpers in `lib/server/fracttal/sheet-fields.ts`.

| Column | Upstream source | Fallback |
| origin | HAZOP/APR/SGI-LEC/SGSO reference parsed from `notes` | `Gerenciamento das Barreiras de Seguranca Operacional: SGSO-PG-0016` |
| install_local | nearest `parent_description` segment above the asset (asset leaf excluded) | `location_code` |
| equip_typology | `field_1` | `groups_description` / `description` |
| field_installed | `active === false` or reserve/stock/scrap keyword in `parent_description` | `Sim` |
| field_operational / op_status / maint_status | derived availability id | (derived) |
| has_maint_plan | `groups_tasks_description` / `id_group_task`, overridden by `N/A PLANO`/`PLANO TCOM` in `field_6` | `Nao` |
| plan_followed | plan presence plus overdue open preventive work only | `Nao` |
| failure_free | absence of open planned/urgent corrective work | (derived) |
| has_contingency / contingency_desc / evidence_code | contingency detection (GM/CEC) | `Nao` / notes |
| degradation_desc | open corrective event `source` | `""` |
| action_plan | open corrective event `detail`/`source` | `""` |
| extra_comments | `notes`, useful `field_6`, technical `field_2/3/4`, then a `field_1`-based identification fallback | (never empty) |
| owner_id / grouping_id | owner: asset family first, work trade fallback; grouping: asset family | `Manutencao` / grouping fallback |

`Plano Preventivo Cumprido?` is intentionally about preventive tasks; an open corrective order does not make it `Nao`. The modal omits `Comentarios` when it duplicates `Degradacao`, while retaining the distinct comments value when one exists. `Dono` is stable by equipment family where that family is recognized; an open work trade only supplies ownership when the family is not classified.
