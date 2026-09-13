# Fracttal safe-harbor spike (P2)

> Read-only. Never writes to prod. Fixtures replay from `scripts/fixtures/`.
> This note records what the real API looks like, how provenance is designed,
> and the field-to-enum mapping draft. Source: official Fracttal docs
> (api.fracttal.com) captured 2026-09-12; verified against the documented
> contract only — no live calls were made (Fracttal access is
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

- `barriers.external_code` (text, UNIQUE, nullable) — the Fracttal asset
  `code`. The upsert matching key (not `id`: Fracttal ids are tenant-local
  and unreadable; `code` is the stable business key).
- `barriers.source_updated_at` (timestamptz, nullable) — the best available
  remote modification signal. Gap: `GET /items` does not return a
  last-modified timestamp in the documented shape, so `source_updated_at`
  stays null until a real capture shows an `updated`-like field.
- `barriers.deleted_at` (timestamptz, nullable) — soft delete. Items missing
  from Fracttal (a full-scope crawl sees none for that `external_code`) set
  `deleted_at`; the row stays so history/audit survives. `is_deleted`
  derived = `deleted_at IS NOT NULL`. Default dashboard views filter it out;
  an admin view can list deleted rows.
- `sync_state` table — one row per run:
  `id, started_at, finished_at, scope (location_code), cursor (start),
  counts (insert/update/skip/error), status (running/ok/failed),
  note`. Ops diagnosis + rerun pointer; does not carry secrets.
- Reconcile rule: within a scope, an asset present locally but absent from
  the remote page set is deleted (soft). Assets matched by `external_code`
  update in place; new codes insert; unmapped status values are listed, not
  guessed (see mapping).

## Mapping draft (Fracttal → app enums / wire types)

The app models barriers with a `disponibilidade`, `conformidade`, and
`criticidade`. Fracttal assets expose `active` and `available` plus
operational fields; there is **no direct conformidade field**, so the draft
is provisional and reviewed against a real fixture before P3.

| App concept                     | Fracttal source (draft)                                                 | Notes                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `externalCode` (new wire field) | `code`                                                                  | Upsert match key                                                                                                                      |
| `disponibilidade`               | `available` + `initial_date_out_of_service`/`last_final_date_available` | `available:false` → some Indisponível bucket; contingent/degraded buckets need a secondary signal (work orders), **unmapped for now** |
| `conformidade`                  | derived: open/corrective work order on the asset — endpoint TBD         | **Unmapped**: needs the work-order contract + fixture review                                                                          |
| `criticidade`                   | `priorities_description` → map                                          | resolved in P3 against the seed: `'Crítica'`/`'Não Crítica'` exact match, anything else is listed and skipped                         |
| `categoria`                     | `groups_1_description`/`groups_2_description`                           | category taxonomy differs per tenant; list, don't force                                                                               |
| `location`                      | `location_code` / `parent_description`                                  | station grouping                                                                                                                      |
| `tag` (barcode label)           | `code`                                                                  | display tag                                                                                                                           |

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

- `lib/server/fracttal/map.ts` — `disponibilidadeFromAsset` (unavailable →
  Indisponível id 5, else Disponível id 0) + `IMPORT_DEFAULTS`
  (`tipologiaId=3`, `agrupamentoId=0`, `locDescId=0`, `donoId=null`).
  Unmapped labels are listed in the run report, never guessed.
- `lib/server/fracttal/sync.ts` — `planReconcile` (pure) + `runSync`
  (orchestrator). Change detection via a stored `signature` (see module
  comment; ORDER IS PART OF THE CONTRACT). Dry-run is the default; nothing
  is written without an explicit flag. Restores reappearing rows, flags
  `statusChanged` on availability flips.
- `lib/server/sql/sync.ts` — the default `SyncIo`: builds label→id context
  from the lookup tables, loads scoped locals, applies the plan (inserts via
  `INSERT ... ON CONFLICT (external_code) DO NOTHING` — the UNIQUE constraint
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
- `lib/server/fracttal/smtp.ts` — a small Deno-native SMTP submission client
  (EHLO, optional STARTTLS upgrade, AUTH PLAIN, MAIL/RCPT/DATA with
  dot-stuffing, QUIT). No external dependency: the reader is released before
  `Deno.startTls` takes the socket, since the TLS handshake requires both
  streams unlocked.
- `lib/server/fracttal/notify.ts` — `OpsNotifier` list, `smtpEmailNotifier`
  plus `smtpConfigFromEnv()` (`OPS_SMTP_HOST` + `OPS_EMAIL_TO` required; port
  465 means implicit TLS), and `notifyFailureToAll` which is best-effort: one
  failing channel never blocks the others.
- `lib/server/fracttal/runner.ts` — `pollOnce` (scope lock → run → notify on
  failure) and `createPollLoop` per scope: a single crashed tick (lock query
  down, upstream down) is reported and the cadence continues; `stop()` is
  stop-safe. `scripts/fracttal-poll.ts` wires it: env-configured scopes
  (`FRACTTAL_SYNC_SCOPES`), cadence (`FRACTTAL_POLL_SECONDS`, min 5), graceful
  SIGINT/SIGTERM shutdown. The lock is the runner's own overlap guard — one
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
- `alert_events`: schema is in place for P5 (dedup on
  barrier + transition date, `sent_at` null until sent); the sync pipeline
  records transitions in `barrier_status_history` only, it does not enqueue
  alerts yet.

Run shapes:

```
# fixture dry-run (default; needs DATABASE_URL for local reconcile)
deno run -A scripts/fracttal-sync.ts --fixture scripts/fixtures/fracttal-assets-sample.json
# same but writing
deno run -A scripts/fracttal-sync.ts --fixture <path> --apply
# live, reviewed prod session only, one station, single bounded GET
deno run -A scripts/fracttal-sync.ts --live --location-code FAL --scope prod:fal --dry-run
# polling cadence (env-driven; needs FRACTTAL_KEY/SECRET + DATABASE_URL)
FRACTTAL_SYNC_SCOPES=FAL scripts/fracttal-poll.ts
```

## Out of scope here

- Write endpoints, webhook receiver (P3+).
- A real fixture (needs prod access) — captured by the procedure above.
