# Fracttal safe-harbor spike (P2)

> Read-only. Never writes to prod. Fixtures replay from `scripts/fixtures/`.
> This note records what the real API looks like, how provenance is designed,
> and the field-to-enum mapping draft. Source: official Fracttal docs
> (api.fracttal.com) captured 2026-09-12; verified against the documented
> contract only - no live calls were made (Fracttal access is
> production-only by locked decision).

## Safe-harbor rules

- Only GET endpoints are in scope; the client module refuses to emit
  non-GET verbs (`client.ts` `verbs`).
- Committing tokens is forbidden. Credentials come from env
  (`FRACTTAL_KEY`/`FRACTTAL_SECRET`), never from code or fixtures.
- Capture runs are bounded: one `location_code`, capped pages (default 1,
  i.e. up to 100 items). Replay fixtures, never prod.
- Ops contact for real calls happens against a tenant in prod, reviewed and
  rate-limit aware (200 req/min per IP).

## Endpoints used

| Method | Path                                   | Purpose                         | Params                                                                                                                                                                           |
| ------ | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `https://app.fracttal.com/api/items`   | Asset list (the barrier feed)   | `code`, `id`, `item_type` (1 Locations, 2 Equipment, 3 Tools, 4 Spare Parts, 5 Digital), `location_code`, `active`, `available`, `is_tree`, `start` (0-based), `limit` (max 100) |
| POST   | `https://one.fracttal.com/oauth/token` | OAuth2 client-credentials token | `grant_type=client_credentials` / `refresh_token` (+ HTTP Basic `key:secret`)                                                                                                    |

Response envelope for `GET /items`:

```json
{ "success": true, "message": "200", "data": [ ...assets... ], "total": 173 }
```

`data` may be an object or absent on some referential endpoints; the client
normalizes `data: []` when missing. Neo limits: every query returns at most
100 records; paginate with `start` += `limit`.

## Limits seen

- 200 requests / minute / IP. Exceeded → HTTP `406` ("Maximum number of
  request exceeded"); wait 60s (or honor `ratelimit-reset`).
- Headers on every response: `ratelimit-limit` (200), `ratelimit-remaining`,
  `ratelimit-reset` (seconds left). The client pauses the remaining seconds
  when `remaining` is low and backsoff on 406/429/5xx.
- Token life: 2h (`expires_in: 7200`). Expiry → `401`. The client refreshes
  once via `grant_type=refresh_token` and retries the same request.

## Provenance design (before code)

Goal: make every DB row traceable to its Fracttal source and every sync run
auditable, with deletions soft.

- `barriers.external_code` (text, UNIQUE, nullable) - the Fracttal asset
  `code`. The upsert matching key (not `id`: Fracttal ids are tenant-local
  and unreadable; `code` is the stable business key).
- `barriers.source_updated_at` (timestamptz, nullable) - the best available
  remote modification signal. Gap: `GET /items` does not return a
  last-modified timestamp in the documented shape, so `source_updated_at`
  stays null until a real capture shows an `updated`-like field.
- `barriers.deleted_at` (timestamptz, nullable) - soft delete. Items missing
  from Fracttal (a full-scope crawl sees none for that `external_code`) set
  `deleted_at`; the row stays so history/audit survives. `is_deleted`
  derived = `deleted_at IS NOT NULL`. Default dashboard views filter it out;
  retired rows are auditable via `GET /api/barriers/deleted` (admin token).
- `sync_state` table - one row per run:
  `id, started_at, finished_at, scope (location_code), cursor (start),
  counts (insert/update/skip/error), status (running/ok/failed),
  note`. Ops diagnosis + rerun pointer; does not carry secrets.
- Reconcile rule: within a scope, an asset present locally but absent from
  the remote page set is deleted (soft). Assets matched by `external_code`
  update in place; new codes insert; unmapped status values are listed, not
  guessed (see mapping).

## Mapping (Fracttal → app enums / wire types)

Single source of truth: `lib/server/fracttal/barrier-rules.ts` (pure,
tested). The dump import (`scripts/fracttal-import.ts`) and the live sync
(`lib/server/fracttal/map.ts`) both call it, so scope, station, typology,
tags, and availability can never diverge again. Precedence: the import
owns catalog rows (creates locations/categories on rebuild); the sync
never creates them (unknown labels skip and are listed in the run report).

The app models barriers with `availability`, `compliance`, and `criticality`.
Fracttal assets expose `active` and `available` plus operational fields;
there is **no direct compliance field**, so compliance stays derived
(never written) on both sides.

| App concept                     | Fracttal source (both paths)                                                                                                               | Notes                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `externalCode` (new wire field) | `code`                                                                                                                                     | Upsert match key                                                                                                                                              |
| `availability`                  | `resolveAvailability`: urgent WO/WR event → 5; planned → 4; `stop_assets`/`initial_date_out_of_service` → 1; `available:false` → 5; else 0 | Work events come from the open-status WO sweep + windowed WR pass (merged per code by `buildWorkEvents`); the import merges dump events the same way          |
| `compliance`                    | derived: open/corrective work order on the asset - endpoint TBD                                                                            | **Unmapped**: needs the work-order contract + fixture review                                                                                                  |
| `criticality`                   | `priorities_description` → map, unknown defaults to `Não Crítica` + warning                                                                | listed in the run report (`mappingWarnings`), never a silent guess                                                                                            |
| `category`                      | `groups_description` keyword scope (both paths; `groups_1_description` is the polo, never consulted)                                       | import creates the row; sync skips unmapped labels                                                                                                            |
| `location`                      | L2 station parse of `parent_description` (both paths), `location_code` fallback for parent-less rows                                       | station grouping; sync skips unknown stations. `STATION_OVERRIDES` corrects known misparses (Base Seacrest - São Mateus-ES → SM; the -ES is the state suffix) |
| `tag` (barcode label)           | `description` falling back to `code`                                                                                                       | display tag                                                                                                                                                   |
| excluded rows                   | `EXCLUDED_EXTERNAL_CODES`                                                                                                                  | known mislabels (e.g. a transmitter tagged `Válvula`) skip with a report count, never silently                                                                |

**Unmapped values are listed explicitly in `scripts/fixtures/README.md`**
and in the capture report (count per unrecognized `groups_*`/`priorities`
value): ids needing new enum rows are derived from that list, never guessed.

## Capture procedure (prod tenant, reviewed)

1. `FRACTTAL_KEY`/`FRACTTAL_SECRET` in env (never committed).
2. `deno run -A scripts/fracttal-capture.ts --location-code <X> --pages 1`
   → writes anonymized page set to `scripts/fixtures/fracttal-assets-sample.json`.
3. Review the report: totals, unmapped values, anomalies.
4. Commit as the P2 fixture; P3 replays it (never calls prod from CI).

## Sync service (P3, as-built)

Pipeline: quoted raw rows → parse (`parsePage`, malformed listed) → map
(`mapAsset`, label→id exact resolution, skip+reason on unmapped) → pure
reconcile plan → apply (or dry-run report) → `sync_state` audit row.

- `lib/server/fracttal/map.ts` - `mapAsset` (scope filter, exact
  label→id resolution, criticality default + warning, typology derived
  from the parent chain, `MapOptions.work`/`today` for events and
  deterministic runs) + `availabilityFromAsset` (asset-flag-only wrapper).
  Unmapped labels are listed in the run report, never guessed.
- `lib/server/fracttal/sync.ts` - `planReconcile` (pure) + `runSync`
  (orchestrator). Change detection via a stored `signature` (see module
  comment; ORDER IS PART OF THE CONTRACT). Dry-run is the default; nothing
  is written without an explicit flag. Restores reappearing rows, flags
  `statusChanged` on availability flips. `SyncOptions.workEvents` carries
  prebuilt per-code work signals into `mapAsset`; the caller fetches them
  BEFORE runSync starts, so a work-endpoint failure aborts with zero
  writes (fail-closed) instead of decaying statuses.
- `lib/server/fracttal/work.ts` - live work signals: `parseWorkOrder` /
  `parseWorkRequest` validators, `workOrderSlot` / `workRequestSlot`
  (same open/closed gates and classifiers as the import), `buildWorkEvents`
  (per-code merge; malformed rows listed, never thrown), `resolverFor`.
  `source_updated_at` is the winning work-event date, else the
  out-of-service date, else null.
- `lib/server/sql/sync.ts` - the default `SyncIo`: builds label→id context
  from the lookup tables, loads scoped locals, applies the plan (inserts via
  `INSERT ... ON CONFLICT (external_code) DO NOTHING` - the UNIQUE constraint
  is the dedup authority; status changes go through the one sanctioned
  `record_status_change()` with author 10 "Sincronização Fracttal"), and
  writes the run audit. Also exposes `syncScopeRunning(scope, staleMinutes=10)`
  as the poll lock: true while a `running` row for the scope is fresh, so a
  crashed run only blocks polls for the stale window instead of forever.
- Sync failures never go silent. `scripts/fracttal-sync.ts` notifies ops on
  every failure (loud stderr line via `consoleNotifier` plus an optional ops
  email) and exits non-zero; the `failed` audit row is still written first, so
  the DB agrees with the alert. This channel is separate from barrier alerts
  (P5 `alert_events`), which stay untouched.
- `lib/server/fracttal/smtp.ts` - a small Deno-native SMTP submission client
  (EHLO, optional STARTTLS upgrade, AUTH PLAIN, MAIL/RCPT/DATA with
  dot-stuffing, QUIT). No external dependency: the reader is released before
  `Deno.startTls` takes the socket, since the TLS handshake requires both
  streams unlocked.
- `lib/server/fracttal/notify.ts` - `OpsNotifier` list, `smtpEmailNotifier`
  plus `smtpConfigFromEnv()` (`OPS_SMTP_HOST` + `OPS_EMAIL_TO` required; port
  465 means implicit TLS), and `notifyFailureToAll` which is best-effort: one
  failing channel never blocks the others.
- `lib/server/fracttal/runner.ts` - `pollOnce` (scope lock → run → notify on
  failure) and `createPollLoop` per scope: a single crashed tick (lock query
  down, upstream down) is reported and the cadence continues; `stop()` is
  stop-safe. `scripts/fracttal-poll.ts` wires it: env-configured scopes
  (`FRACTTAL_SYNC_SCOPES`), cadence (`FRACTTAL_POLL_SECONDS`, min 5), graceful
  SIGINT/SIGTERM shutdown. The lock is the runner's own overlap guard - one
  scope never runs two syncs at once.
- History rule: history appends only on a real status change. Freshly
  imported rows get one stamp (`Importado do Fracttal`), so the timeline is
  never empty.
- Deletion rule: scoped locals absent upstream (and not already deleted) are
  soft-deleted (`deleted_at = now()`). Deletion is per-scope: a one-station
  sync never retires another station's barriers.
- `sync_state`: `status` (`running/ok/failed`), counts
  (`inserts/updates/deletes/skips`), `scope`, `note`. The skips total always
  reconciles to (malformed + unmapped + planned skips), so the row sums with
  the run report.
- `alert_events`: consumed by the P5 alert cycle (`scripts/alerts-check.ts`):
  dedup on barrier + transition date, `sent_at` null until sent. The sync
  pipeline itself still records transitions in `barrier_status_history`
  only - it never enqueues alerts.

Run shapes:

```
// fixture dry-run (default; needs DATABASE_URL for local reconcile)
deno run -A scripts/fracttal-sync.ts --fixture scripts/fixtures/fracttal-assets-sample.json
# same but writing
deno run -A scripts/fracttal-sync.ts --fixture <path> --apply
# fixture plus the work-order status pass
deno run -A scripts/fracttal-sync.ts --work-fixture scripts/fixtures/fracttal-work-sample.json
# live, reviewed prod session only, one station, single bounded GET
deno run -A scripts/fracttal-sync.ts --live --location-code FAL --scope prod:fal --dry-run
# polling cadence (env-driven; needs FRACTTAL_KEY/SECRET + DATABASE_URL)
FRACTTAL_SYNC_SCOPES=FAL deno run -A scripts/fracttal-poll.ts
```

The live status pass fetches one recent page (100 rows) each of
`/work_orders` and `/work_requests` per scope run and matches rows to
barriers by asset code. This keeps actively-changing statuses fresh
between rebuilds; a full backfill is the import rebuild, not the poll
loop. Optional `FRACTTAL_WORK_DATE_GTE` forwards a `date[gte]` floor to
the work-orders fetch.

## Import vs sync precedence (both live, scoped)

The dump import owns catalog rebuilds; the live sync owns the rows between
rebuilds. When they disagree, this table wins:

| Concern                   | Import rebuild (`--apply`)                           | Live sync (between rebuilds)                            |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| locations/categories rows | creates from the dump taxonomy                       | never creates; unknown labels skip + list in the report |
| barrier set               | truncates + rebuilds (scope filter + exclusion list) | upserts by `external_code`, soft-deletes scoped-absent  |
| availability              | full dump WO/WR merge                                | asset flag + bounded recent WO page                     |
| `tag`/typology            | derived from description / parent chain              | same rules; updates applied on change                   |
| criticality               | default `Não Crítica`                                | default `Não Crítica` + warning                         |
| history                   | one import stamp per barrier                         | appends on real change via `record_status_change()`     |
| audit                     | one `dump-import` row                                | per-scope `running/ok/failed` rows                      |

Rebuild when: a new dump arrives, the taxonomy needs an overhaul, or a
backfill must reconcile every scope (see below).

## Scope fetch and backfill procedure

One shared assembly (`fetchScopeSignals`) drives every live run: item
pages paginate to the envelope total (`FRACTTAL_SYNC_MAX_PAGES`, default
40 x 100 rows), `assertCompletePage` throws on any truncation, and the
bounded work pass merges after the guard. A truncated scope or a
work-endpoint failure aborts before `runSync` with zero writes; a
too-small page cap fails loudly (raise the cap and rerun, never bypass
the guard).

Rate math: worst case per scope per tick is maxPages item GETs + 2 work
GETs (FAL needs ~13 today). Keep `FRACTTAL_SYNC_SCOPES` to the stations
you operate and the 200 req/min/IP ceiling is never close.

Backfill after an outage or before trusting a scope:

1. `deno run -A --env-file=.env scripts/fracttal-sync.ts --live
   --location-code <STATION> --scope backfill:<STATION> --dry-run
   --pages 40` (report only; aborts loudly when truncated).
2. Rerun with `--apply`; confirm `sync_state` shows `ok` with
   deletes near zero.
3. Reconcile against the import baseline per station:
   `select l.code, count(*) from barriers b join locations l on
   l.id = b.location_id where b.deleted_at is null group by l.code
   order by 2 desc;`

## Out of scope here

- Webhook receiver (polling first; webhooks only if Fracttal supports them,
  with signature check).
- A real fixture (needs prod access) - captured by the procedure above.
