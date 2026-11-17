# Architecture - Safety Barrier Monitor

Deno-only Fresh 2 + Vite + Preact islands over PostgreSQL. This document maps
the current runtime, request paths, authentication, station scoping, alert
delivery, sync, export, and deployment. Schema detail lives in
[DATABASE.md](DATABASE.md), routes and payloads in [API.md](API.md), status
definitions in [STATUSES.md](STATUSES.md), and decisions in
[DECISIONS.md](../DECISIONS.md).

## Runtime and stack

- Deno 2.9+, app version 0.4.0, and all configuration in
  [deno.jsonc](../deno.jsonc): tasks, import map, TypeScript, lint, and format.
  No `package.json`, `tsconfig.json`, or ORM.
- Fresh 2.3.3 with Vite 7 (`@fresh/plugin-vite`), Preact 10 with signals,
  PostgreSQL via `@db/postgres`, `openid-client` for SSO, and linkedom tests.
- [main.ts](../main.ts) boots one `App<State>` with `staticFiles()` and
  `fsRoutes()`; [client.ts](../client.ts) imports styles for HMR and
  [vite.config.ts](../vite.config.ts) wires the Fresh Vite plugin.
- Tasks: `check` (`deno fmt` in write mode, lint, `deno check`, and the
  migration-order guard), `test`, `dev`, `build`, `preview`, `start`
  (`.env`, port 8300), `start:alt` (`.env`, port 8301), `db:migrate`,
  `db:seed`, `admin:create`, `fracttal:*`, `alerts:*`, and `docker:*`.
- Configuration is parsed at startup by `loadServerConfig()`; bad values fail
  fast. `COMPANY_NAME` is read per request; [.env.example](../.env.example)
  lists the supported variables.

## Layers and boundaries

- `routes/`: SSR pages and HTTP edge. Pages gate the session before loading
  data; API routes own validation, auth, scoping, and response envelopes.
- `lib/`: shared pure logic and types. No Preact and no `localStorage`.
- `islands/`: hydrated browser code. `Dashboard.tsx` is the single dashboard
  root and accepts server-provided props because islands cannot read env.
- `components/`, `hooks/`, `context/`: presentational components, client state,
  settings, theme, and connection health.
- `lib/server/`: server-only Postgres, SQL, auth, exports, sync, alerts, and
  logging. It is never imported by islands, components, hooks, or context.
  `lib/export/` holds the pure CSV, XLSX, and PDF builders.

Boundary rules:

- Mock mode serves in-memory data through the same `lib/api.ts` interface as
  HTTP mode; the dashboard does not branch on transport details.
- Status writes go only through `record_status_change()`, in the same
  transaction as the related metadata edit.
- `effective_availability_id()` applies the contingency overlay, so filters,
  KPI, chart, and alert detection agree on the displayed availability.
- Filtering and sorting are centralised in `lib/server/sql/where.ts`;
  user-controlled sort names are whitelisted and values are bound.
- Soft-deleted barriers are hidden except through the admin `rowScope` path;
  `barriers.manual_fields` protects admin-owned columns from the Fracttal sync
  until `releaseFields` returns them.

## Page and API request flow

1. Fresh dispatches to a file route. `routes/index.tsx` calls
   `requirePageSession()`; unauthenticated visitors redirect to `/login` with a
   return target, and a pending local password goes to `/trocar-senha`. The
   page renders the shell with company name, mode, and seed data, then the
   dashboard island hydrates and calls `/api/*` with the session cookie.
2. Data routes call the auth helpers: a session or `ADMIN_TOKEN` for reads,
   an admin session for writes. Pending-password sessions are denied with
   `403 PASSWORD_CHANGE_REQUIRED` except on the documented auth exemptions.
3. Writes pass the Origin / `Sec-Fetch-Site` CSRF guard and the per-client
   throttle. Handlers validate parameters and JSON bodies, resolve the allowed
   station ids, and issue bound SQL.
4. Responses use `{ error, code, requestId }` plus `x-request-id` on failure;
   JSON reads carry ETags and may answer 304. The root middleware adds
   compression, immutable-asset caching, `no-store` on auth pages, and security
   headers including the production CSP. `/api/health` is DB-free liveness and
   `/api/ready` checks configuration plus a database round-trip; both are
   public and unthrottled. Route details are in [API.md](API.md).

## Authentication and sessions

Sessions are opaque, not JWTs:

- `createSessionToken()` draws 32 random bytes as hex. Only the SHA-256 hash is
  stored in `sessions`; the browser holds the raw token in the
  `barrier_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS).
  The 12-hour TTL and row deletion (logout, password change, deactivation)
  revoke access immediately.
- Local email/password login is the break-glass path and cannot be disabled:
  `AUTH_LOCAL_ENABLED=false` is rejected at startup. Passwords are at least 12
  characters. Login failures return one generic 401, with a dummy hash check
  keeping unknown and inactive accounts timing-comparable.
- `GET /` and every guarded API read/write enforce the role and pending-password
  gates. `GET /api/auth/me` and logout stay usable while a password change is
  pending.

Temporary passwords for new or reset local accounts are generated per person,
stored only as a hash with `must_change_password = true`, and shown once in the
admin response; [create-admin](../scripts/create-admin.ts) prompts on masked
stdin for the first admin. The forced-change gate answers
`403 PASSWORD_CHANGE_REQUIRED` until `POST /api/auth/password` sets a new
password and revokes every session. Token auth is exempt; Entra accounts never
carry the flag.

## Entra ID SSO

SSO is an optional second sign-in, behind `AUTH_SSO_ENABLED=true`; local login
remains available as the break-glass path.

- Flow: OpenID Connect authorization code with PKCE (S256), `state`, `nonce`,
  exact redirect URI, and `response_mode=query`.
- Routes: `GET /auth/entra/login`, `GET /auth/entra/callback`,
  `GET /auth/entra/frontchannel-logout`, and `GET /auth/entra/logged-out`.
- Configuration: `AUTH_ENTRA_TENANT_ID`, `AUTH_ENTRA_CLIENT_ID`, and either
  `AUTH_ENTRA_CLIENT_SECRET` or the private-key/certificate pair. Tuning comes
  from `AUTH_SSO_FORCE_ACCOUNT_PICKER`, `AUTH_SSO_FLOW_TTL_SECONDS`,
  `AUTH_SSO_CLOCK_TOLERANCE_SECONDS`, `AUTH_SSO_HTTP_TIMEOUT_MS`, and
  `AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED`; `APP_BASE_URL` derives the callback
  and post-logout URIs, which must be registered exactly in Entra.
- Provisioning: accounts are created by an admin with `auth_source = 'entra'`;
  there is no just-in-time creation. The first valid sign-in binds the pending
  row by a validated email claim (preferred username, email, or UPN, normalised
  and deduplicated); later sign-ins match by `(entra_tid, entra_oid)`. An
  address nobody provisioned gets no access, however valid the token. Local
  roles stay authoritative and Entra groups are not mapped.
- Conversion and tokens: converting a local account preserves its id and
  history, clears the password hash, and disables local login and admin
  password reset for it. ID/access/refresh tokens are used only inside the
  callback and then discarded; none are stored.
- Flows and logout: short-lived authorization state lives in `auth_flows`,
  keyed by a SHA-256 hash of `state`, with a browser-binding cookie. Logout may
  also end the provider session when front-channel logout is enabled; that
  redirect is best effort and local revocation remains the security boundary.

Entra rows have a nullable password hash; the `must_change_password` gate and
`(entra_tid, entra_oid)` uniqueness rules are in [DATABASE.md](DATABASE.md).

## Roles and station scoping

- Two roles: `admin` and `user`. Admin routes and mutations check
  `role === "admin"`; the settings admin chunk keeps its fail-closed gate.
- `resolveAllowedLocationIds()` returns `null` for admins (every station) and
  an explicit array for every non-admin, including malformed sessions. A
  non-admin's array is the union of the locations of their access groups; no
  group yields an empty array, which means zero rows.
- `buildWhere()` turns an empty scope into `and false` and a non-empty scope
  into `b.location_id = any(...)`. The scope is applied to reads and exports;
  client filters can only narrow it, and SQL construction is the enforcement
  point because Postgres has no row-level security here. Groups live in
  `access_groups`, `user_access_groups`, and `access_group_locations`; the
  same derivation feeds alert delivery.

## Data model

Postgres holds lookups and dynamic vocabularies, barriers, contingency links,
status history, users, sessions, auth flows, access groups, alert
rules/events/recipients, field option sets, sync state, and throttle buckets.
Soft deletes use `deleted_at`; contingency links are local and independent of
the sync. Schema and verification rules are in [DATABASE.md](DATABASE.md).

## Alert pipeline

Delivery belongs to the MSGFLOW HTTP provider; detection, rules, watermark,
deduplication, and audience stay local. There is no local SMTP path.

1. **Detect.** The scheduled worker `alerts:poll` runs every
   `ALERTS_POLL_SECONDS` (default 900, minimum 60), reads urgent transitions
   since its watermark, and applies active admin alert rules (per-category
   enable/disable, critical-only, optional recovery). A manual status change
   also fans out immediately from the request path after commit.
2. **Derive the audience.** `loadAlertAudience()` selects active users with a
   non-blank email in one set-based query. Admins map to a null scope (all
   stations); non-admins to the union of their access-group locations, and no
   group maps to an empty array. Inactive users and blank emails are excluded.
3. **Filter per station.** `recipientsForLocation()` drops blank emails and
   keeps an unrestricted recipient for every station. A restricted recipient
   is kept only when the barrier's station is in their array; an unknown or
   null station reaches only unrestricted recipients. This filter runs in the
   scheduled `runProviderCycle`, immediate `maybeSendProviderImmediate`, and
   request-triggered `fanoutStatusChange`.
4. **Send.** Each event becomes one provider POST with a landing mapping
   (`violada`, `degradada`, `normalizada`, or suppressed planned stop).
   Deduplication and failure parking stay local; failed events remain unsent
   for a later cycle, and planned stops are accepted without a provider call.
   Configuration is `ALERT_PROVIDER_BASE_URL`, `ALERT_PROVIDER_TOKEN`,
   `ALERT_PROVIDER_COMPANY_ID`, and `APP_BASE_URL`.

`alert_recipients` is legacy manual data. Admin screens and batch endpoints may
still manage it, but delivery does not read it. Account notices reuse the same
provider configuration and `APP_BASE_URL`; they are not part of barrier
audience derivation.

## Settings and admin workspace

Appearance and filter defaults are browser-local under the `barrier-settings`
key: theme, accent, density, font size, reduced motion, blur, and default
filters. The context hydrates after mount for SSR consistency, validates each
field, and falls back to defaults instead of failing on stale JSON. Nothing
appearance-related is persisted server-side.

The settings panel is a centered workspace modal with grouped navigation:
Preferências (Aparência, Filtros), Conta, Administração (Usuários, Grupos,
Destinatários, Regras, Opções), and Sistema (Sincronização). Admin pages load
lazily behind the admin gate and share search, 25/50/100 paging, selection
pruning, dialogs, and batch actions. The sync page shows run history and
health from the dashboard connection.

## Batch endpoints

Bulk actions are one admin-only POST per resource, atomic and all-or-nothing:

- `POST /api/users/batch`: max 500 ids; activate/deactivate/promote/demote/
  revoke sessions; keeps the last active admin and last active local admin.
- `POST /api/access-groups/batch`: max 200 groups and 500 related ids, cross
  product capped at 20,000; delete, add/remove users, add/remove locations.
- `POST /api/recipients/batch` and `POST /api/alert-rules/batch`: max 500 ids;
  recipient activate/deactivate/delete/add users, rule
  activate/deactivate/delete.

Validation and guard failures return `400` with `BAD_REQUEST`; unexpected
failures return `500` without database text. Details are in [API.md](API.md).
The UI exports only the current selection; the server streams CSV, XLSX, or PDF
in 5,000-row batches with a 200,000-row ceiling and the same station scope.
The XLSX builder is in-house, not the `xlsx` package.

## Fracttal sync

Fracttal is read-only: the client permits GET only and the app never writes
upstream. The sync uses OAuth2 client credentials, a full equipment sweep plus
work/open-status and work-request passes, reconciles by `external_code`, and
soft-deletes missing rows. Dry run is the default; `--apply` enables writes.
Station mapping is client-side from `parent_description`; unmapped labels are
reported, never guessed, and one poller lock prevents overlapping runs.
`manual_fields` protects admin-owned columns. See [FRACTTAL.md](FRACTTAL.md).

## Deployment

- **Docker Compose.** The stack uses `denoland/deno:2.9.7` and
  `postgres:18-alpine`. The app publishes `127.0.0.1:8300`; the bundled Caddy
  template provides TLS. Services include the app, database, migration/tools,
  Fracttal poller, and alert loop. `deno task docker:migrate` applies
  migrations and `deno task docker:up` builds and starts.
- **Windows native.** Windows Server 2022/2025 with Deno, PostgreSQL, NSSM, and
  Caddy. [deploy/windows/Setup.cmd](../deploy/windows/Setup.cmd) is the
  idempotent installer; [DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md) covers values
  and upgrades.
- **Standalone.** `deno task build` produces `_fresh/`; `deno task start` reads
  `.env` on port 8300 and `deno task start:alt` serves on 8301. `preview` serves
  the build without env. Migrations run before first start and schema changes.

Only 8300 is published by default; [PORT-MAP.md](PORT-MAP.md) lists the rest.

## Dependency and security caveat

Dependencies are pinned in [deno.jsonc](../deno.jsonc) and `deno.lock`, and the
runtime and database images are digest-pinned. One accepted advisory remains:
`xlsx@0.18.5` (the last npm release) has two high advisories, prototype
pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9), fixed in
newer releases. It is used only by `scripts/geral-coverage.ts` to read a
trusted local workbook, not in the production runtime or export path, which
uses the in-house builder. Re-check on any `xlsx` upgrade.

Other invariants: secrets stay in environment or mounted files, the session
cookie is opaque and `HttpOnly`, writes pass the CSRF guard, auth pages are
`no-store`, and production responses carry the CSP and hardening headers.
