# API layer - Barrier Monitor

Single entry point `lib/api.ts` (barrel over `lib/api/*`). UI calls only `api.getBarriers`, `api.getAllBarriers`, `api.getBarrierById`, `api.getKpi`, `api.getChartData`. Mock and HTTP adapters share the same interface.

## Wire format

Backend exchanges numeric codes, never display strings. Resolvers in `lib/enums/`:
`toXId(string) -> number | undefined`, `fromXId(number) -> string`.

- Location: 0 ALL, 1 FAL, 2 SML, 3 FSR, 4 IBU, 5 FSL, 6 CNC, 7 JCT, 8 FSJ.
- Availability: 0 Disponível, 1 Fora de Operação, 2 Indisponível Contingenciado, 3 Degradado Contingenciado, 4 Degradado, 5 Indisponível.
- Compliance: 0 Conforme, 1 Não Conforme.
- Criticality: 0 ESO, 1 A, 2 B, 3 C, 4 D (ESO/A critical).
- Category, grouping, typology, owner, location description and history author follow the same pattern.

`compliance` is not sent in `WireBarrier`; it is derived from availability via `isCompliant()`. Resolver, mock and SQL all apply the contingency overlay (stored 4/5 with `hasContingency='Sim'` reads as 3/2).

Wire/domain types: `lib/wireTypes.ts`, `lib/types.ts`, `lib/api/types.ts`, `lib/resolve.ts`.

## Main routes

Public probes: `/api/health` (liveness, DB-free) and `/api/ready` (readiness: config plus a DB round-trip). Reads (session cookie or `ADMIN_TOKEN`): `/api/barriers`, `/api/barriers/ids`, `/api/barriers/:id`, `/api/barriers/:id/contingencies`, `/api/kpi`, `/api/chart`, `/api/vocabularies`, `/api/sync-status`, `/api/sync-runs`, `/api/sync-changes`, `/api/barriers/:id/sync-detail`, `/api/export`, `/api/lookups`, `/api/field-options`. Admin-only reads: `/api/barriers/deleted`, `/api/barriers/:id/fracttal-raw` (`DEV=true`).

Writes (admin): status, barrier edit, contingency links, recipients, users, alert rules, field options. Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/password`.

## Key behaviors

- `/api/barriers` supports location, availability, compliance, category, typology, criticality, criticalOnly, hasActionPlan, rowScope, query, since/until, page, pageSize, sortCol, sortDir.
- `/api/barriers/ids` returns the id list for the active filters (used for
  select-all across pages).
- Barrier edits (PATCH `/api/barriers/:id`) accept `releaseFields`: a list of
  owned field keys returned to the Fracttal sync; edited fields join
  `manualFields` so the sync stops overwriting them.
- Barriers carry `manualFields`: the list of columns an admin took over.
- Exports stream CSV/XLSX/PDF over the whole filtered scope, 5,000-row batches, 200,000-row ceiling.
- Soft-deleted rows are visible only to admins through `rowScope`.
- Errors use `{ error, code, requestId }` plus `x-request-id`.
- GET JSON responses carry ETags and may return 304.
- Throttle: 120 req/min reads, 30 req/min writes, 120 req/min exports, 10 req/min password changes per client. Behind the bundled Caddy template the app trusts `X-Real-IP` only from the loopback proxy; extra proxies must be listed in `TRUSTED_PROXY_IPS`.
- `/api/health` is unthrottled and DB-free; `/api/ready` is the orchestrator readiness check.

## Users and passwords

- `POST /api/users` (admin): without `password` the server draws a per-person
  password, stores only its hash with `must_change_password = true`, and
  returns `{ ..., temporaryPassword, aviso }` once. With `password` it keeps
  the old behavior and sets no flag. `aviso` reports the MSGFLOW notice
  outcome (`{ sent, reason? }`). See D30.
- `PATCH /api/users/:id` (admin): `resetPassword: true` draws a fresh
  password, sets `mustChangePassword: true`, revokes sessions, and returns
  the same once-only `temporaryPassword` plus `aviso`. It cannot be combined
  with `password`. This is the repair path for shared or leaked passwords.
  See D30 and D32.
- `POST /api/auth/password` (session only, allowed while pending): verifies
  the current password, sets the new one, clears the flag, and revokes every
  session in the same transaction. Token auth is rejected here. See D31.
- Pending local sessions get `403 { error, code: "PASSWORD_CHANGE_REQUIRED" }`
  on every guarded read and write. The UI answers by showing the
  change-password form. Exempt: `POST /api/auth/password` (the way out),
  `POST /api/auth/logout` and `GET /api/auth/me` (both resolve the raw
  session and stay usable while pending), token auth (no user identity), and
  the `/trocar-senha` page (the single exception). `GET /` redirects pending
  local users to `/trocar-senha`;
  Entra accounts never enter this state. See D31.

## SSO

When `AUTH_SSO_ENABLED=true`, Entra routes are available under `/auth/entra/*`. Entra users are pre-provisioned by an admin; the first valid sign-in binds by email to the pending row, later sign-ins match by object id. There is no JIT creation: an address nobody enabled gets no access. Entra users cannot use local password login or admin password reset. Converting a local account to Entra preserves id and history and clears the password hash. See `docs/SSO-ENTRA-PLAN.md` and D29.

## Setup

1. Start Postgres and run `deno task db:migrate` (and optionally `db:seed`).
2. Set `PUBLIC_API_MODE=http` and `DATABASE_URL`.
3. Run `deno task dev`, `build`, or `start`.

See `docs/DATABASE.md` and `docs/ARCHITECTURE.md`.
