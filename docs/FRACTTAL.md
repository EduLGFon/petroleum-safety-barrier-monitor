# Fracttal integration

Read-only CMMS integration. The app never writes to Fracttal: there is no
write-back and no webhook registration. Fracttal One exposes a REST API only,
so near-real-time data comes from polling.

## Rules

- Only GET data endpoints; the client refuses other verbs. The OAuth token
  request is the only non-GET call.
- Base URL host allow-list: `app.fracttal.com`. Default
  `https://app.fracttal.com/api`; a configured URL outside the allow-list
  fails closed before the first request.
- Credentials come from `FRACTTAL_KEY`/`FRACTTAL_SECRET`; never committed and
  never accepted in argv.
- OAuth2 client credentials are exchanged at
  `https://one.fracttal.com/oauth/token`. Access tokens last about 2 hours and
  are refreshed once on a data 401.
- Maximum 100 rows per request. An adaptive token bucket paces every request
  and backs off on 406/429/5xx.
- `DEV=true` enables an admin-only, bounded, on-demand raw detail GET in the
  HTTP-mode barrier modal.

## Endpoints used

| Method | Path                                   | Purpose                       |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | `/api/items`                           | Asset list and barrier feed   |
| GET    | `/api/items/{code}`                    | One asset by code             |
| GET    | `/api/work_orders`                     | Work orders used for status   |
| GET    | `/api/work_requests`                   | Work requests used for status |
| POST   | `https://one.fracttal.com/oauth/token` | OAuth2 client credentials     |

Station scoping is client-side. Upstream `location_code` values are
group/asset tags, not station codes, so the sync sweeps every equipment row
and partitions stations from the parent chain.

## Data hierarchy

Equipment `items` rows carry a slash-separated `parent_description`: L1
operator/polo, L2 area, L3 station, L4 system, L5+ asset. Empty segments from
the leading slashes are dropped. The station code is the L3 segment's trailing
`- CODE` token; the display name is the text before that token, title-cased.

- L2 concession areas are physical areas, not the seed location rows. They
  split the shared mobile-test-unit L3 segment into `CJ-UTM-N` (`Area Norte`)
  and `CJ-UTM-C` (`Area Centro`). Run `deno task db:migrate` before the next
  sync so both catalog rows exist.
- One L2 base segment ends in a state suffix rather than a station code; a
  documented override maps it to station `SM` instead of treating `-ES` as a
  station.
- Alias segments below L3 become their own stations: `SM8` is a collector
  station and the `3-CO-<n>-ES` well-cluster pattern maps to `CO`. The alias
  patterns are anchored so a transformer segment such as `CO-03` stays under
  its L3 station.
- `location_code` is a fallback only when no parent station resolves. Live
  values are group/asset tags, never station codes.

## Field coverage

Only fields needed for scope, status, display and the sheet inventory are
synced. Everything else stays behind the admin-only raw detail panel.

Asset rows (`GET /items`) captured:

- Identity and flags: `id`, `code`, `active`, `available`, `id_type_item`,
  `description`, `location_code`, `id_parent`.
- Taxonomy and hierarchy: `items_types_description`, `groups_description`,
  `groups_1_description`, `groups_2_description`, `priorities_description`,
  `parent_description`, `units_description`, `is_serial_control`.
- Maintenance plan: `id_group_task`, `groups_tasks_description`.
- Out-of-service dates: `initial_date_out_of_service`,
  `last_final_date_available`.
- Free text: `field_1` through `field_6`, and `notes`.

Not captured: additional custom fields, commissioning dates, running hours,
cost center, geolocation, and inventory/accounting fields. `groups_1_description`
is the polo/area and is never the category; the category is
`groups_description`. Criticality is derived from the TAG suffix plus the ESO
flag, because `priorities_description` is effectively null upstream.

Work-order rows (`GET /work_orders`) captured: join code, open/done and status,
corrective/preventive classification, stop flag and durations, text and notes,
failure context, priority, trigger, contingency status and labels, date
candidates, people, and request/item joins. The remaining upstream fields,
including cost and most timestamps, are not stored.

Work-request rows (`GET /work_requests`) captured: join code, status,
`is_urgent`, priority, type labels, text, date candidates, status-transition
detail, people, and item/work-order joins. The remaining upstream fields are
not stored.

## Asset taxonomy and scope

The category label comes from `groups_description`. Barrier scope provenance
comes from two gates:

- A folded, case/accent-insensitive match of `BARRIER_KEYWORDS` against the
  taxonomy label: `valvula`, `extintor`, `detec`, `alarme`, `sirene`,
  `incendio`, `bloqueio`, `intertravamento`, `seguran`, `emerg`, `psv`,
  `alivio`, `hidrante`, `gas`, `fumaca`, `h2s`, `corta-chamas`.
- `groups_2_description` equal to `ESO`.

These gates do not exclude rows. Every equipment row with a code enters the
monitor once its station and category resolve, and the admitting gates are
stored in `scope_source` (`keyword`, `eso`, `keyword+eso`, or `all`) so a later
scope change stays reversible. Free-text `description` is never matched:
doing so pulls in non-barrier assets whose text happens to contain a keyword.
A mislabeled row enters mislabeled and is fixed upstream in Fracttal, not
filtered here.

Criticality ranks are `ESO > A > B > C > D`, derived from the TAG suffix letter
plus the ESO flag and a last-resort priority label. Unparseable ranks fall back
to `D` with a warning; rank ids are a hard contract with
`db/seed_lookups.sql`. Unknown station and category labels are listed as skips
and are created by the live sync before mapping; an unknown criticality rank
still skips loudly.

## Status derivation

`resolveAvailability` is the shared pure rule used by both the live sync and
the dump import. It writes one of six exact labels:

| Id | Label                       | Compliant |
| -- | --------------------------- | --------- |
| 0  | Disponível                  | yes       |
| 1  | Fora de Operação            | yes       |
| 2  | Indisponível Contingenciado | yes       |
| 3  | Degradado Contingenciado    | yes       |
| 4  | Degradado                   | no        |
| 5  | Indisponível                | no        |

Precedence, first match wins:

1. Open urgent corrective: `Indisponível` (5), or `Indisponível
   Contingenciado` (2) when contingency is in place.
2. Open planned corrective carrying the urgent flag: `Degradado` (4), or
   `Degradado Contingenciado` (3) when contingency is in place.
3. Planned corrective without the urgent flag: no status signal.
4. Stopped asset or out-of-service date: `Fora de Operação` (1). An explicit
   out-of-service date outranks a bare `available = false` flag.
5. Asset flagged unavailable: `Indisponível` (5).
6. Otherwise: `Disponível` (0).

Urgent/planned classification reads `Corretiva Emergencial`/`Falha Funcional`
and `Corretiva Planejada`/`Falha Potencial`. The urgent flag comes from the
work request `is_urgent` boolean or a high/emergency work-order priority. A
request only classifies when its type text carries a `corretiva` or `falha`
stem; abbreviated labels such as `CORR - Planejada` carry no signal, matching
import behavior.

`2` and `3` are contingency states: the manual contingency flag overlays stored
`4`/`5` at read time, and auto-detected GM/CEC/contingência text in open
corrective work can promote the derived result to `3`/`2` with the source
recorded. Compliance is fixed by id: `0` to `3` are compliant, `4` and `5` are
non-compliant, and an unknown id fails closed to non-compliant. There is no
fixed transition matrix; any status may follow any other. A same-status write
is a no-op and adds no history. `Fora de Operação` is a compliant planned stop
and alert delivery suppresses it. See [STATUSES.md](STATUSES.md).

## Work-order event date

The status event date is the earliest valid `YYYY-MM-DD` among the row's date
candidates. Merged events keep the earliest date and the first non-empty
source. An event without a date still derives an open status; `status_since`
then falls back to today.

- Work order candidates: `initial_date`, `date_maintenance`, `creation_date`,
  `event_date`, `final_date`, `wo_final_date`, `cal_date_maintenance`,
  `first_date_task`.
- Work request candidates: `date_incident`, `date_maintenance`, `date`,
  `date_status`.
- The dump import keeps its narrower extractor: `initial_date`,
  `date_maintenance`, `creation_date` for both row kinds. Live parsing adds
  the request and order candidates above.
- Preventive plan follow-up uses the scheduled maintenance date pair in the
  import, so a future-dated plan is not flagged overdue from its creation
  date.

## Sync

- Full equipment sweep plus an open-status work-order sweep and a windowed
  work-request pass.
- Live item pages must be complete or the run aborts before any write.
  Truncated work pages only miss signals; they never delete rows.
- Dry-run is the default. `fracttal:sync` replays a fixture unless `--live` is
  passed; writes require `--apply`. `fracttal:force-sync` is the full live
  recovery sweep and is also dry-run unless `--apply` is passed.
- `runSync` writes barriers, status history and `sync_state`. Reconcile is by
  `external_code`; rows absent upstream are soft-deleted. Missing locations and
  categories are created on applying runs.
- Status changes go through `record_status_change()`. A same-status write is a
  no-op and adds no history row.
- Manual fields are excluded from the sync signature and update, so an admin
  edit survives later sweeps until released.
- Two pollers cannot overlap. A crashed run blocks only until the stale lease
  window lapses.

## Dump import

The import rebuilds the dashboard database from a local Fracttal export. The
dump is not in the repository, so it only runs on a machine that has one
(typically under `test/`, which is git-ignored). Expected files:

- `items-2-equipment.json`
- `work-orders.json`
- `work-requests.json`

```bash
deno task fracttal:import -- --dir <dump>          # report only
deno task fracttal:import -- --dir <dump> --apply  # truncate and write
```

The script streams each JSON array one object at a time. The equipment pass
builds barriers, stations and categories; work orders and requests join by
`code`/`code_item`, and the shared classifiers and status precedence apply. A
dry run only reports counts and derived status. `--apply` truncates
`barrier_status_history`, `barriers`, `sync_state` and `alert_events`, then
truncates and rebuilds `locations` and `categories` with deterministic ids,
inserts the barriers, and writes one `Importado do Fracttal` stamp per barrier
into history.

Prerequisite: `deno task db:migrate` plus a configured `DATABASE_URL`. The
import passes the asset `available` flag as true because the dump semantics for
that column are unverified, so status comes from work events and the
out-of-service date. For fixture-based development and CI, use the samples in
`scripts/fixtures/` instead of a dump.

## Capture

`fracttal:capture` writes a bounded, anonymized asset page set into
`scripts/fixtures/` for mapping review. Credentials must be present in the
process environment from a reviewed production session; they are never read
from argv or fixtures.

- One `--location-code` per run, `--item-type` default `2`, and `--pages` 1 to
  10 with at most 100 rows per page.
- `--base-url` is allow-listed and `--output` must be a direct JSON child of
  `scripts/fixtures/`.
- `anonymizeAsset` strips private and free-text fields before saving.
- The capture records a census of taxonomy labels (`groups_1_description`,
  `groups_2_description`, `priorities_description`, `units_description`) so
  unmapped values are listed, never guessed.
- The script never writes upstream and never writes outside the fixture
  directory.

Review the output before committing it; a reviewed capture can replace the
synthetic asset sample in `scripts/fixtures/`. `fracttal:extract` is a
separate read-only stdout sample across item types. Its output contains live
tenant codes and must not be committed.

## Tasks

- `fracttal:poll`: live polling loop. One shared work pass per cycle, then the
  full equipment sweep. Failures are recorded and logged.
- `fracttal:sync`: one-shot fixture replay or `--live` sweep; dry-run default.
- `fracttal:force-sync`: full live recovery sweep; dry-run unless `--apply`.
- `fracttal:audit`: read-only live stations versus the DB catalog, with
  unmapped categories and red flags. Exits 1 on a station audit failure.
- `fracttal:import`: dump rebuild described above.
- `fracttal:capture`: bounded anonymized fixture capture.
- `fracttal:extract`: small read-only stdout sample for reconciliation.

## Limits and failure handling

Upstream limit is about 200 requests per minute per IP. The client uses an
adaptive token bucket and backs off on 406/429/5xx. Page size is capped at 100
rows and tokens last about 2 hours.

Failures are always logged as structured console lines and recorded in
`sync_state`. There is no email notifier for sync failures; delivery of barrier
alerts belongs to the alert provider. Lock contention is routine and is
reported as a skip, not a failure.
