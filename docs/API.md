# API reference

Dashboard clients use `/api/*` JSON; `/api/export` is the only binary
response. Pages are `/`, `/login`, `/trocar-senha` and `/auth/entra/*`.
Every route file under `routes/api/` and `routes/auth/` is covered below;
`_params.ts` and `validation_test.ts` are a helper and a test, not routes.

## Error envelope and request ids

Every failure returns `{ error, code, requestId }` with an `x-request-id`
header. Successes keep their domain body and also carry `x-request-id`.
`304` responses have no body and echo the ETag.

| Status | Code                       | Meaning                                                           |
| ------ | -------------------------- | ----------------------------------------------------------------- |
| 400    | `BAD_REQUEST`              | Invalid JSON, parameter, id or body value                         |
| 401    | `UNAUTHORIZED`             | Dead or missing credential where camouflage does not apply        |
| 403    | `FORBIDDEN`                | Authenticated but not allowed (admin-only or cross-site)          |
| 403    | `PASSWORD_CHANGE_REQUIRED` | Valid local session still using a system password                 |
| 404    | `NOT_FOUND`                | Missing row, or anonymous camouflage on a guarded route           |
| 429    | `RATE_LIMITED`             | Fixed-window budget exhausted; `retry-after` follows              |
| 500    | `INTERNAL`                 | Unexpected failure; never includes database text                  |
| 503    | `UNAVAILABLE`              | Config, auth store or database unavailable; `retry-after` follows |

## Auth levels

| Level        | Accepted credentials                                     | Used by                                                                 |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| public       | None                                                     | `/login`, `/trocar-senha`, `/api/health`, `/api/ready`, `/auth/entra/*` |
| session-only | `barrier_session` cookie only; `ADMIN_TOKEN` is rejected | `/api/auth/me`, `/api/auth/password`, `/api/auth/profile`               |
| data         | `ADMIN_TOKEN` Bearer or any active session               | Dashboard reads and `/api/export`                                       |
| admin        | `ADMIN_TOKEN` Bearer or an active admin session          | Writes, user/group/rule/recipient management, `/api/lookups`            |

The session cookie is `barrier_session`, HttpOnly, SameSite=Lax, Secure when
the request or `APP_BASE_URL` is HTTPS, with a 12-hour server-side expiry.
Anonymous data or admin calls get `404 NOT_FOUND` camouflage; invalid
credentials get `401 UNAUTHORIZED`; an authenticated non-admin on an admin
route gets `403 FORBIDDEN`. A local session with `must_change_password` set
gets `403 PASSWORD_CHANGE_REQUIRED` on every guarded route. Exempt are
`POST /api/auth/password` (the way out), `POST /api/auth/logout`,
`GET /api/auth/me`, token auth, and `/trocar-senha`; `GET /` redirects such
a session to `/trocar-senha`. Entra accounts never carry the flag and cannot
use password login.

Entra is optional and enabled only when `AUTH_SSO_ENABLED=true` and the
settings load. Accounts are pre-provisioned by an admin; there is no
just-in-time creation. The first valid sign-in binds a pending address to
`(entra_tid, entra_oid)`; later sign-ins match the pair. When SSO is
disabled every `/auth/entra/*` route answers `404`.

## Request policy

- Writes: non-GET/HEAD/OPTIONS requests with an explicit cross-site
  `Origin` or `Sec-Fetch-Site` signal get `403 FORBIDDEN`; same-origin
  requests and callers sending neither header pass.
- Throttles are in-process fixed windows keyed by client address. Only a
  loopback peer or a `TRUSTED_PROXY_IPS` address may supply `X-Real-IP` or
  the first `X-Forwarded-For` hop.
- ETags: most JSON GETs carry a strong `etag`, `cache-control: private,
  no-cache` and `vary: Cookie`, and answer `304` on `If-None-Match`.
  Exceptions: `/api/health`, `/api/ready`, `/api/access-groups/:id`, the DEV
  raw Fracttal detail and the binary export.

| Bucket      | Budget  | Applies to                                               |
| ----------- | ------- | -------------------------------------------------------- |
| read        | 120/min | Most GET routes                                          |
| write       | 30/min  | POST/PATCH/PUT/DELETE, login and logout                  |
| password    | 10/min  | `/api/auth/password`, `/api/auth/profile`                |
| export      | 120/min | `/api/export`; the shared database bucket is tried first |
| fracttalRaw | 5/min   | `/api/barriers/:id/fracttal-raw`                         |

`/api/health` and `/api/ready` are unthrottled. JSON bodies default to a
256 KiB cap; specific routes cap lower or higher as noted below.

## Health and readiness

| Method and path   | Auth   | Request | Response and notes                                                                                                                   |
| ----------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health` | public | none    | `{ ok, time }`; never touches the database                                                                                           |
| `GET /api/ready`  | public | none    | `{ ok, mode, time }` after config load and `select 1`; `503 UNAVAILABLE` with `retry-after` on failure; mock mode skips the database |

## Sessions and account

| Method and path           | Auth         | Request                                                     | Response and notes                                                                                                                                                                                                                                                         |
| ------------------------- | ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`    | public       | `{ email, password }`                                       | `200` public user, sets the session cookie; generic `401` on failure; revokes a presented session before minting the new one; write throttle                                                                                                                               |
| `POST /api/auth/logout`   | public       | none                                                        | `{ ok, ssoLogoutUrl }`, clears the cookie; a missing or invalid session still succeeds                                                                                                                                                                                     |
| `GET /api/auth/me`        | session-only | none                                                        | Current session user: id, email, name, phone, role, active, `allowedLocationIds`, `auth_source`, `auth_method`, `mustChangePassword`; `401` without a valid session; stays usable while a password change is pending                                                       |
| `POST /api/auth/password` | session-only | `{ currentPassword, newPassword }`                          | `{ ok: true }`; verifies the current password, applies the 12-256 character policy, rejects reusing the same password, clears `must_change_password`, revokes every session and clears the cookie in one transaction; `401` on a wrong current password; password throttle |
| `PATCH /api/auth/profile` | session-only | `{ name?, email?, phone?, currentPassword?, newPassword? }` | Updated public user, or `{ ok: true }` after a password change which also revokes all sessions and clears the cookie; `401` on a wrong current password; password throttle; token auth answers `401 session required`                                                      |

## Entra OIDC

| Method and path                       | Auth   | Request                     | Response and notes                                                                                                                                                            |
| ------------------------------------- | ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/entra/login`               | public | `?next=` same-origin path   | `302` to Entra with PKCE, state and nonce; stores the one-time flow and sets the binding cookie; `no-store`; already signed-in users are redirected to `next`                 |
| `GET /auth/entra/callback`            | public | OIDC `code`, `state`, `iss` | `303` to the return path and a session cookie, or to `/login?sso=<code>` on failure; validates issuer, nonce, state, PKCE and claims; no account match means `no_access`      |
| `GET /auth/entra/frontchannel-logout` | public | `iss`, `sid`                | `200 text/plain` on every valid configuration; validates the tenant issuer and hashed sid, then revokes matching sessions; `404` when SSO or front-channel logout is disabled |
| `GET /auth/entra/logged-out`          | public | none                        | `303` to `/login?sso=logout`; clears the local session and cookie                                                                                                             |

## Barriers

| Method and path                                 | Auth  | Request                                                                                  | Response and notes                                                                                                                                                                            |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/barriers`                             | data  | Shared barrier filters plus `page`, `pageSize`, `sortCol`, `sortDir`                     | `{ items, total, page, pageSize, totalPages }` of wire barriers; default page 1, size 25, maximum size 1000; `rowScope=deleted\|all` requires admin                                           |
| `GET /api/barriers/ids`                         | data  | Shared barrier filters, no paging                                                        | `{ ids, total }` for the same filtered scope; at most 200,000 ids; `rowScope=deleted\|all` requires admin                                                                                     |
| `GET /api/barriers/:id`                         | data  | numeric id                                                                               | Wire barrier including status history and `manualFields`; `400` invalid id, `404` missing; admins may read soft-deleted rows, non-admins are station-scoped and get `404` outside their scope |
| `PATCH /api/barriers/:id`                       | admin | Editable barrier fields plus `releaseFields` (below)                                     | Updated wire barrier; one transaction for metadata, status transition and contingency overlay; `400` on invalid values; `404` missing                                                         |
| `PATCH /api/barriers/:id/status`                | admin | `{ statusId, authorId?, note? }`                                                         | Updated wire barrier; session callers derive `authorId` from their own user, token callers must supply it; same-status calls are a no-op with no history row; `400` invalid, `404` missing    |
| `GET /api/barriers/:id/contingencies`           | data  | `?q=` up to 200 chars                                                                    | `{ outgoing, incoming, candidates, candidatesHaveMore }` with at most 50 candidates and optional MOC/risk references; deleted or out-of-scope rows give `404` for non-admins                  |
| `POST /api/barriers/:id/contingencies`          | admin | `{ contingencyBarrierId, managementChange?, riskAnalysis? }`                             | `{ created: true }`; duplicate or ineligible links are `400`; body cap 10,000 bytes                                                                                                           |
| `PATCH, DELETE /api/barriers/:id/contingencies` | admin | `{ contingencyBarrierId, managementChange?, riskAnalysis? }` or `?contingencyBarrierId=` | `PATCH` answers `{ updated: true }` and `DELETE` answers `{ removed: true }`; `404` when the link is missing; `PATCH` body cap 10,000 bytes                                                   |
| `GET /api/barriers/:id/sync-detail`             | data  | `?runId=` or `?scope=last-day`                                                           | `{ detail }` with the before/after snapshot for one barrier; absent both uses the latest change; non-admins are station-scoped and get `404` for deleted or inactive rows                     |
| `GET /api/barriers/deleted`                     | admin | Barrier filters plus `page`, `pageSize`, `sortCol`, `sortDir`                            | Same paged shape as `/api/barriers`; always deleted-only; accepts location, availability, compliance, category, criticality, action-plan, text and date filters                               |
| `GET /api/barriers/:id/fracttal-raw`            | admin | numeric id                                                                               | Raw upstream detail for the barrier's `externalCode`; only when `DEV=true`, otherwise `404`; `404` missing barrier or asset; `private, no-store`; 5/min                                       |

## Dashboard aggregates

| Method and path          | Auth  | Request                                      | Response and notes                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/kpi`           | data  | Shared barrier filters, including `rowScope` | KPI snapshot: fixed status and compliance counts, `pctCompliant`, critical non-compliance, no-action-plan count, dynamic `byAvailability`, `byCompliance`, `byCriticality`, `ncByCriticality`, admin `inactive`/`deleted`, `syncedAt`; 30-second server memo; `rowScope=deleted\|all` requires admin |
| `GET /api/chart`         | data  | Shared barrier filters                       | `{ categoryId, compliant, total }[]`, largest total first; 30-second memo; `rowScope=deleted\|all` requires admin                                                                                                                                                                                    |
| `GET /api/vocabularies`  | data  | none                                         | `{ locations, availabilities, compliances, criticalities, categories, typologies, authors }` labels and counts; station-scoped; a zero-station user gets empty lists; 60-second memo                                                                                                                 |
| `GET /api/field-options` | data  | none                                         | `{ field, options, updated_at, updated_by }[]`; missing fields are seeded from defaults on read                                                                                                                                                                                                      |
| `PUT /api/field-options` | admin | `?field=<key>` and `{ options: string[] }`   | Saved option-set row; maximum 200 options of 200 characters each; body cap 64 KiB; unknown field is `400`                                                                                                                                                                                            |
| `GET /api/lookups`       | admin | none                                         | Id-bearing `availabilities`, `categories`, `locations`, `criticalities`, `typologies`, `groupings`, `owners`, `authors`                                                                                                                                                                              |

## Export

`GET` and `POST /api/export` share one contract. Filters and `format` may be
query parameters; the optional selection `{ ids, timeZone }` travels in the
JSON body so a large selection never has to fit a URL. A non-JSON or absent
body means the whole filtered scope. Body cap is 4 MiB.

| Method and path         | Auth | Request                                                                              | Response and notes                                                                                                                                                                                                                                                                            |
| ----------------------- | ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET, POST /api/export` | data | `format=csv\|xlsx\|pdf`, shared barrier filters, body `{ format?, ids?, timeZone? }` | Binary attachment with `x-export-total`, `content-disposition: attachment`, `private, no-store`; rows stream from the database in 5,000-row batches; ceiling 200,000 rows; over the ceiling is `400 BAD_REQUEST` with the real count; `rowScope=deleted\|all` requires admin; export throttle |

## Sync inspection

| Method and path         | Auth | Request                                                                                                                 | Response and notes                                                                                                                                                                                           |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/sync-status`  | data | none                                                                                                                    | `{ state, runningSince, lastRun, totals }`; state is `syncing`, `idle`, `stale` or `unknown`; 15-second memo                                                                                                 |
| `GET /api/sync-runs`    | data | `?limit=` 1-50, default 10                                                                                              | `{ runs }`, newest finished runs first; each run has id, scope, status, timestamps and counts                                                                                                                |
| `GET /api/sync-changes` | data | `?scope=last-run\|last-day`, `?runId=`, `?kind=new\|updated\|removed\|restored\|all`, `?query=`, `?page=`, `?pageSize=` | `{ run, items, total, page, pageSize, totalPages, summary }`; page size default 25, maximum 100; `runId` overrides scope; station-scoped; legacy `?limit=` without other paging params returns `{ changes }` |

## User administration

| Method and path                  | Auth  | Request                                                                                    | Response and notes                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users`                 | admin | none                                                                                       | Public user rows plus `entra_oid`; never password hashes                                                                                                                                                                                                                                              |
| `POST /api/users`                | admin | `{ email, name?, phone?, password?, role?, authSource?, entraObjectId?, accessGroupIds? }` | `201` created user. Omitting or passing an empty `password` generates a per-person temporary password, sets `must_change_password`, and returns `temporaryPassword` plus `aviso` once with `no-store`. `authSource=entra` forbids a password and requires SSO; `accessGroupIds` applies to non-admins |
| `PATCH, DELETE /api/users/:id`   | admin | PATCH body below, or numeric id                                                            | Updated user, or `{ ok: true }` on delete; `404` missing; last-admin guards return `400`                                                                                                                                                                                                              |
| `DELETE /api/users/:id/sessions` | admin | numeric id                                                                                 | `{ revoked }`; `404` missing user                                                                                                                                                                                                                                                                     |
| `POST /api/users/batch`          | admin | `{ action, ids }`                                                                          | `{ affected }`; actions `activate`, `deactivate`, `promote`, `demote`, `revokeSessions`; at most 500 unique positive ids; missing ids are `400`; atomic, last-admin guards preserved; `revokeSessions` counts deleted sessions                                                                        |

`PATCH /api/users/:id` accepts `email`, `name`, `phone`, `role`, `active`,
`password`, `resetPassword`, `authSource` and `entraObjectId`.
`resetPassword=true` is local-only, cannot combine with `password`,
`authSource` or `entraObjectId`, revokes sessions, and returns a one-time
`temporaryPassword` plus `aviso`. Password and active changes revoke
sessions; the last active admin and last active local admin guards apply.

## Access groups

| Method and path                             | Auth  | Request                                                                 | Response and notes                                                                                                                                                                                                                              |
| ------------------------------------------- | ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET, POST /api/access-groups`              | admin | none, or `{ name, description?, locationIds?, userIds? }`               | List ordered by name with `locationIds`/`userIds`, or `201` created group; name required; body cap 10,000 bytes; duplicate name is `400`                                                                                                        |
| `GET, PATCH, DELETE /api/access-groups/:id` | admin | numeric id, and PATCH `{ name?, description?, locationIds?, userIds? }` | Group row or updated group; PATCH replaces arrays; `DELETE` answers `{ ok: true }` and cascades links; body cap 10,000 bytes; duplicate name is `400`; `404` missing                                                                            |
| `POST /api/access-groups/batch`             | admin | `{ action, ids, userIds? \| locationIds? }`                             | `{ affected }`; actions `delete`, `addUsers`, `removeUsers`, `addLocations`, `removeLocations`; at most 200 group ids and 500 related ids; cross product at most 20,000; body cap 256 KiB; missing groups, users or locations are `400`; atomic |

## Recipients (legacy manual list)

These routes and the `alert_recipients` table are a legacy manual list. Alert
delivery no longer reads them; see the audience note below.

| Method and path                     | Auth  | Request                                    | Response and notes                                                                                                                                                      |
| ----------------------------------- | ----- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/recipients`               | admin | `?activeOnly=1`                            | `{ id, email, name, phone, active, created_at }[]`                                                                                                                      |
| `POST /api/recipients`              | admin | `{ email, name?, phone? }`                 | `201` recipient; upserts `name` and `phone` by email and leaves `active` unchanged                                                                                      |
| `PATCH, DELETE /api/recipients/:id` | admin | `{ name?, phone?, active? }` or numeric id | Updated recipient, or `{ ok: true }` on delete; `404` missing; empty patch is `400`                                                                                     |
| `POST /api/recipients/batch`        | admin | `{ action, ids?, userIds? }`               | `{ affected }`; actions `activate`, `deactivate`, `delete`, `addUsers`; at most 500 unique ids; `addUsers` copies user rows by email and forces `active = true`; atomic |

## Alert rules

| Method and path                      | Auth  | Request                                                                                                                                    | Response and notes                                                                                                                                |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/alert-rules`               | admin | `?activeOnly=1`                                                                                                                            | Rule rows with scope arrays, urgency, anti-noise fields, priority, validity window and timestamps                                                 |
| `POST /api/alert-rules`              | admin | Rule fields (below)                                                                                                                        | `201` created rule; duplicate name is `400`; invalid scope, urgency, hour, day or date values are `400`                                           |
| `PATCH, DELETE /api/alert-rules/:id` | admin | Any rule field, or numeric id                                                                                                              | Updated rule, or `{ ok: true }` on delete; `404` missing; empty patch is `400`                                                                    |
| `POST /api/alert-rules/batch`        | admin | `{ action, ids }`                                                                                                                          | `{ affected }`; actions `activate`, `deactivate`, `delete`; at most 500 unique ids after dedupe; missing ids are `400`; atomic and all-or-nothing |
| `GET /api/alert-rules/preview`       | admin | `?categoryIds=`, `?locationIds=`, `?criticalityIds=`, `?typologyIds=`, `?groupingIds=`, `?ownerIds=`, `?staleDays=`, `?onlyNoActionPlan=1` | `{ count, tags }` for the current matching rows, with at most five sample tags; non-positive id lists or stale days are `400`                     |

Rule fields are `name`, `description`, `categoryId`, `toStatusId`,
`criticalOnly`, `includeRecovery`, `staleDays`, `notifyImmediate`, `active`,
`categoryIds`, `fromStatusIds`, `toStatusIds`, `locationIds`,
`criticalityIds`, `typologyIds`, `groupingIds`, `ownerIds`, `urgency`
(`any`, `urgent`, `critical`), `onlyNoActionPlan`, `onTransition`,
`cooldownMinutes`, `maxPerDay`, `quietStartHour`, `quietEndHour`,
`activeDays`, `priority`, `validFrom`, `validTo` and `staleRepeatDays`.
Nullable arrays mean "all". `priority` orders first-match wins, highest
first, then lowest id.

## Shared barrier filters

`/api/barriers`, `/api/barriers/ids`, `/api/kpi`, `/api/chart`,
`/api/barriers/deleted` and `/api/export` share these query keys:

- `locationId` selects one station (`0` means all). `availabilityId`,
  `complianceId`, `categoryId`, `typologyId` and `criticalityId` take one
  id or a comma-separated list.
- `criticalOnly=true` keeps ESO/A; `hasActionPlan=true|false` filters plan
  presence; `query` is trimmed text, at most 200 characters.
- `since` and `until` are inclusive `YYYY-MM-DD` bounds on `status_since`.
- `rowScope=active|inactive|deleted|all`, default `active`; `deleted` and
  `all` are admin-only.
- `sortCol` is one of `id`, `tag`, `location`, `typology`, `criticality`,
  `category`, `owner`, `availability`, `compliance`, `contingency` or
  `statusSince`; anything else falls back to `id`. `sortDir` defaults to
  `asc`.
- `/api/barriers` and `/api/barriers/deleted` add `page` and `pageSize`
  (maximum 1000). `/api/barriers/deleted` ignores `typologyId`,
  `criticalOnly` and `rowScope` and always lists deleted rows.

## Barrier edit fields

`PATCH /api/barriers/:id` accepts `tag`, `locationId`, `typologyId`,
`categoryId`, `groupingId`, `ownerId`, `criticalityId`, `comments`,
`actionPlan`, `availabilityId`, `statusNote`, and the sheet fields `origin`,
`installLocal`, `equipTypology`, `fieldInstalled`, `fieldOperational`,
`opStatus`, `hasMaintPlan`, `planFollowed`, `failureFree`, `maintStatus`,
`hasContingency`, `contingencyDesc`, `evidenceCode`, `degradationDesc` and
`extraComments`.

An explicit `availabilityId` wins over the contingency overlay. Otherwise a
change to `hasContingency` promotes stored Degradado/Indisponível (4/5) to
Degradado/Indisponível Contingenciado (3/2), and clearing it demotes them
back. Edited columns join `manualFields`, which the Fracttal sync skips.
`releaseFields` is a list of known edit keys returned to the sync; unknown
names are `400`.

## Alert audience

There is no audience HTTP endpoint. Delivery derives the audience from
active users and access groups: an admin receives every station, a non-admin
receives the union of their groups' stations, and a non-admin with no group
receives nothing. Each alert is then filtered to the station of its barrier.
A null or unknown station reaches only unrestricted (admin) recipients.
`/api/recipients*` and `alert_recipients` are the legacy manual list and are
not read by delivery.

See [DATABASE.md](DATABASE.md) for tables and relationships,
[ARCHITECTURE.md](ARCHITECTURE.md) for layers, and
[STATUSES.md](STATUSES.md) for the availability overlay.
