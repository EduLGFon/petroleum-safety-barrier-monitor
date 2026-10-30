# Fracttal integration

Read-only upstream integration. The app never writes to Fracttal.

## Rules

- Only GET endpoints; non-GET verbs are refused by the client.
- Credentials come from `FRACTTAL_KEY`/`FRACTTAL_SECRET`; never committed.
- Capture and sync runs are bounded and reviewed.
- `DEV=true` enables an admin-only, bounded, on-demand raw detail GET in the HTTP-mode barrier modal.

## Endpoints used

| Method | Path                                   | Purpose                                       |
| ------ | -------------------------------------- | --------------------------------------------- |
| GET    | `/api/items`                           | Asset list and barrier feed                   |
| GET    | `/api/items/{code}`                    | One asset by code                             |
| GET    | `/api/work_orders`                     | Task rows used for status                     |
| GET    | `/api/work_requests`                   | Supplementary work requests                   |
| GET    | `/api/transactions_log`                | Asset change feed (probed, not consumed)      |
| GET    | `/api/items_availability`              | Out-of-service history (probed, not consumed) |
| POST   | `https://one.fracttal.com/oauth/token` | OAuth2 client credentials                     |

Maximum 100 rows per request. Station scoping is done client-side from `parent_description`; upstream `location_code` values are group/asset tags, not station codes.

## Sync

- Full equipment sweep plus an open-status work sweep and a windowed work-request pass.
- Dry-run is the default; writes require `--apply`.
- Reconcile is by `external_code`, with soft deletes for missing rows.
- Unmapped labels are listed, never guessed.
- Status changes go through `record_status_change()`.
- Two pollers cannot overlap; a crashed run blocks only for the stale window.

## Operations

- Poller: `deno task fracttal:poll`.
- One-shot: `deno task fracttal:sync -- --live --apply`.
- Audit: `deno task fracttal:audit`.
- Force sync after outage: `deno task fracttal:force-sync -- --apply`.
- Ops email is optional; failures are always logged and recorded in `sync_state`.

## Limits

Upstream limit is about 200 requests per minute per IP. The client uses an adaptive token bucket and backs off on 406/429/5xx. Tokens last 2 hours.
