# SSO with Microsoft Entra ID - implementation plan

Status: proposed, not approved. This document contains no implementation and
does not approve any decision. New sign-in methods and new dependencies require
an ADR and owner approval.

| Field               | Value                                              |
| ------------------- | -------------------------------------------------- |
| Date                | 2026-10-26                                         |
| Repository snapshot | commit `2368be2`, clean before this document       |
| Target              | Dashboard login via OpenID Connect with Entra ID    |
| Constraints         | safe, secure, fast, lightweight, Deno-only, Postgres sessions |
| Approval needed     | ADR for sign-in method, ADR for dependency, owner decisions |

Repository files may change before implementation. Re-read the impact map and
re-run verification items before starting a phase.

## Executive summary

- Add Microsoft Entra ID as a second dashboard sign-in method using the
  authorization code flow with PKCE (S256), `state`, `nonce`, an exact redirect
  URI, and `response_mode=query`.
- Keep the existing opaque Postgres session and `barrier_session` cookie. IdP
  tokens are used only inside the callback request and then discarded. No
  access, refresh, or ID token is stored.
- Keep local roles authoritative. Entra app roles, group claims, and automatic
  role mapping are out of scope for the first release.
- Provision Entra users by Object ID before first login. No just-in-time
  creation, and never auto-link an existing local account by email, UPN, or
  `preferred_username`.
- Keep local password login and at least one active local administrator as the
  break-glass path. Disabling local login is a separate decision and ADR.
- Use `openid-client` 6.8.8 rather than hand-rolled JWT validation. It is MIT
  licensed, OpenID Certified, Deno-compatible, and adds `jose` plus
  `oauth4webapi` as transitive dependencies.
- Store short-lived authorization flows server-side in Postgres, keyed by a
  SHA-256 hash of `state`, with a browser-binding cookie hash. This works
  across multiple app instances without sticky sessions.
- Ship dark behind `AUTH_SSO_ENABLED=false`, pilot with a small Entra group,
  then enable for everyone. Existing sessions stay valid during rollout.

## Scope and non-goals

In scope: Entra OIDC login for the dashboard; admin pre-provisioning by Object
ID; conversion of a local user to Entra without losing id or history; admin
session revocation; local password login as break-glass; schema, API, UI,
config, docs, tests, and operations changes for the above.

Out of scope for the first release: replacing `ADMIN_TOKEN`; Microsoft Graph,
access/refresh tokens, or token caching; SCIM, JIT provisioning, or email
auto-link; Entra group-to-role mapping, app roles, or PIM; front-channel,
back-channel, or CAE logout; multi-tenant, B2C, SAML, WS-Federation, or
passwordless local login; removing local password login or the break-glass
admin; a new database, cache, queue, or worker.

## Current state

Authentication today is small and explicit: `users` with unique lowercased
email, name, role (`admin` or `user`), active, and `password_hash NOT NULL`;
PBKDF2-SHA256 passwords (210,000 iterations); opaque 32-byte sessions in
`barrier_session` with only the SHA-256 hash stored and a 12 h fixed TTL;
`ADMIN_TOKEN` first then cookie session; anonymous calls get 404 camouflage,
dead credentials get 401; server-side page gate with `/login` as the only
public page; email plus password local login with a dummy hash for unknown or
inactive accounts; logout deletes the session row and clears the cookie;
self-service password change revokes all sessions; last active admin cannot be
demoted, deactivated, or deleted. Key constraints: `password_hash` is `NOT
NULL` so SSO users need a nullable hash plus a shape constraint; `sessions`
lacks auth method and IdP session id; `ADMIN_TOKEN` must never be an SSO
credential; auth routes set their own headers since the app has none globally;
`deno task check` covers `routes/api/*` but not `routes/auth/*`; `deno task
test` allows network only to `127.0.0.1` and `localhost`; latest ADR is D12.

## Target architecture

Browser -> app `GET /auth/entra/login?next=` -> insert `auth_flows` row, set
`barrier_sso` binding cookie -> 302 to Entra authorize -> user authenticates ->
`GET /auth/entra/callback?code=&state=` -> consume flow by state hash, compare
binding hash, token exchange with PKCE and client auth, validate ID token, map
`(tid, oid)` to local user, insert opaque session -> 303 to `return_to` with
`barrier_session` cookie. The browser never receives an Entra token; every
dashboard request resolves the cookie in Postgres.

New modules: `lib/server/config.ts` (auth config parsing), `lib/server/auth/entra/{config,client,flows,claims,errors,logout,keys}.ts`,
`lib/server/sql/auth-flows.ts`, and routes under `routes/auth/entra/`. Design
principles: reuse the existing session model; fail closed; minimize data
(tenant id, Object ID, auth source, optional sid hash only); keep the trust
boundary server-side; keep the first release small; make rollback a config
change.

## Identity and provisioning model

Stable identity key is `(tid, oid)` from the ID token. `tid` must equal
`AUTH_ENTRA_TENANT_ID`; `oid` is immutable in that tenant; `sub` is validated
but not stored; `email`, `preferred_username`, `upn`, and `name` are never
used to find, link, create, or authorize. Rules: admin creates the local user
before first Entra login and enters the Object ID; tenant comes from config;
no JIT provisioning; no email auto-link; local email stays canonical; guests
supported with the resource-tenant Object ID; recreated Entra accounts get a new
Object ID and the mapping must be updated; roles remain local and
authoritative; local `active` remains authoritative (a disabled Entra account
keeps its local session until TTL or revocation).

Local-to-Entra conversion preserves `users.id` and authored history: admin
session plus target id; reject if target is the last active local admin; set
`auth_source='entra'`, `entra_tid` from config, `entra_oid` from the validated
request, `password_hash=NULL`; revoke all sessions in the same transaction;
audit log with actor and target ids only (no Object ID or email); return the
updated admin shape. Conversion back to local is not supported in the first
release.

## OIDC protocol design

Use the authorization code flow with PKCE. No implicit or hybrid flow, no
`offline_access`, no token storage.

Authorization request: `response_type=code`, `client_id`, exact
`redirect_uri={APP_BASE_URL}/auth/entra/callback`, `scope=openid profile`,
`state` (32 random bytes, stored as SHA-256 hash), `nonce` (32 random bytes),
`code_challenge` (S256), `code_challenge_method=S256`, `response_mode=query`,
and `prompt=select_account` when `AUTH_SSO_FORCE_ACCOUNT_PICKER` is true. No
`login_hint`, `domain_hint`, `max_age`, `claims`, `acr_values`, or
`offline_access`. `response_mode=query` keeps the callback a top-level GET so
the `SameSite=Lax` binding cookie is sent; the code is single-use and PKCE-bound.

Flow start (`GET /auth/entra/login?next=`): 404 if SSO disabled; redirect to a
validated `next` if already authenticated; apply the write throttle; validate
`next` with `safeAuthNext`; generate `state`, binding token, `nonce`, and PKCE
verifier; insert the flow row; set the `barrier_sso` binding cookie
(`HttpOnly`, `SameSite=Lax`, `Path=/auth/entra`, TTL equal to flow TTL,
`Secure` on HTTPS, no `Domain`); redirect 302. Flow TTL is 10 minutes by
default.

Callback (`GET /auth/entra/callback`): 404 if SSO disabled; write throttle;
reject missing, duplicated, or oversized params (code <= 4096, state <= 256);
if `error` is present, log only the code, consume or discard the flow, clear
the binding cookie, redirect to a generic login error; atomically consume the
flow by `state_hash` regardless of binding result; compare `browser_hash` in
constant time; build a synthetic callback URL from the configured redirect URI
plus only `code` and `state`; exchange with `authorizationCodeGrant`; validate
the ID token policy; map `(tid, oid)` to an active local user; create a new
opaque session with `auth_method='entra'` and optional `idp_sid_hash`; clear the
binding cookie, set the session cookie, redirect 303 to `return_to`.

`safeAuthNext(raw, appBaseUrl)`: empty or missing -> `/`; must start with a
single `/`; reject `//`, backslashes, control chars, schemes; reject after
percent-decoding if it starts with `//` or contains a backslash; reject
`/login`, `/auth/`, and `/api/` prefixes; max 2048 chars; parse with
`new URL(value, appBaseUrl)` and require the origin to equal the configured app
origin; store only path and query.

Discovery: issuer is
`https://login.microsoftonline.com/{AUTH_ENTRA_TENANT_ID}/v2.0`; never use
`common` or `organizations`; cache the discovered configuration in module
memory for one hour and reset on failure; fetch timeout 10 s by default with
`AbortSignal.timeout` and a custom fetch that rejects redirects; pass timeout in
seconds to the library; register `redirect_uris`, `response_types: ["code"]`,
`token_endpoint_auth_method`, `id_token_signed_response_alg: "RS256"`, and
`clockTolerance`. Do not pre-warm discovery during boot.

## Token validation

`openid-client` validates protocol mechanics; the app adds a policy layer. Both
are required. Library: verify signature against tenant JWKS; enforce issuer and
audience; check `exp`, `nbf`, `iat` with clock tolerance; check `nonce` and
`state`; send the PKCE verifier; validate `azp` when present; reject unsigned
tokens and disallowed algorithms. App policy after `claims()`: issuer must equal
the configured tenant v2 issuer; audience must contain the client id; `tid`
must equal `AUTH_ENTRA_TENANT_ID`; `oid` must be a non-empty GUID; `sub` must
be a non-empty string; `ver` must be `2.0`; `nonce` must match the consumed
flow; `azp` must be absent or equal to the client id; `exp` must be in the
future after tolerance; `iat` must not be unreasonably in the future; `sid` is
optional and hashed if present. `email`, `preferred_username`, `upn`, `name`,
`roles`, and `groups` are never used as identity or authorization inputs.

Client authentication prefers certificate credentials with `private_key_jwt`
(PEM PKCS#8 key plus matching certificate, PS256, `aud` set to the token
endpoint in `modifyAssertion`, `iss` and `sub` set to the client id, `typ: JWT`,
`x5t#S256` thumbprint, short `exp`, unique `jti`, RSA-PSS with SHA-256).
Fallback is `client_secret_post`. Exactly one method is configured at a time;
both is a boot error. The token endpoint response is read only for `claims()`;
no token is read, logged, cached, or persisted.

Errors map to stable internal reasons (`discovery_failed`,
`token_request_failed`, `invalid_signature`, `invalid_claims`, `unknown_user`,
`inactive_user`, `flow_expired`, `flow_replayed`, `binding_mismatch`). Log the
reason, request id, and error class name only. Public errors are generic short
codes. Misconfiguration logs loudly and returns a generic 500 or 503; no
insecure fallback.

## Session model

Successful Entra login creates the same kind of row as password login:
`user_id`, `token_hash` (SHA-256 of the new opaque token), `expires_at` now
plus 12 h, `auth_method='entra'`, and `idp_sid_hash` (SHA-256 of a
domain-separated `tid:sid` when `sid` is present, else `NULL`). The cookie
remains `barrier_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on
HTTPS). Every login mints a new token, so no session fixation. No sliding
expiration.

Logout: local logout deletes the session row and clears the cookie and is the
security boundary. For an Entra session, `POST /api/auth/logout` also returns a
best-effort `ssoLogoutUrl` pointing at the Entra end-session endpoint with
`post_logout_redirect_uri=/auth/entra/logged-out`. No `id_token_hint` is sent
because no ID token is stored. The logged-out route clears any local session
cookie it receives and redirects to `/login?sso=logout`; it must not require
authentication. `/auth/entra/logged-out` must be registered as a redirect URI.

Session revocation: `DELETE /api/users/:id/sessions` revokes every session for
a user and returns `{ revoked }`. Admins can revoke their own sessions. A later
front-channel logout can call the same helper by `idp_sid_hash`.

Residual risk: a disabled Entra account keeps its local session until the 12 h
TTL expires unless an admin revokes it. Document this and keep the TTL under
review.

## Data model and migration

Additive and idempotent schema change, with indexes after the `ALTER TABLE`
stanzas so the migration-order guard passes.

Users: add `auth_source text not null default 'local'`, `entra_tid text`,
`entra_oid text`; drop `NOT NULL` on `password_hash`; add
`users_auth_source_valid` check (`auth_source in ('local','entra')`); add
`users_auth_source_shape` check (local requires a password hash and no Entra
identity; Entra requires an Entra identity and no password hash); add a partial
unique index on `(entra_tid, entra_oid)` where `auth_source='entra'`.

Sessions: add `auth_method text not null default 'password'` and
`idp_sid_hash text`; add `sessions_auth_method_shape` check
(`auth_method in ('password','entra')`, password rows have no sid hash, sid
hash matches `^[0-9a-f]{64}$`); add a partial index on `idp_sid_hash`.

New `auth_flows` table: `state_hash` primary key (64 hex), `browser_hash`
not null, `nonce` (32-128), `code_verifier` (43-128), `return_to` not null
default `/` (local path, <= 2048), `created_at` default now, `expires_at`,
with an index on `expires_at`.

Flow SQL: insert with hashes, TTL, and return target; atomic consume deletes by
`state_hash` where `expires_at > now()` and returns stored fields; sweep
deletes expired rows. The login route sweeps before inserting; at the 10,000
row cap it sweeps once and retries, then fails closed with a generic 503 and
logs `flow_capacity`. User/session SQL: lookup by
`(auth_source='entra', entra_tid, entra_oid)`, never fall back to email; revoke
all sessions for a user; revoke by sid hash; count active local admins as
`role='admin' and active and auth_source='local'`. Keep `lockActiveAdmins` and
add `countActiveLocalAdmins` under the same locks. The existing last-active-admin
guard stays; the new guard additionally blocks removing the last active local
admin while local login is break-glass. Verify migration on a copy before
production: no local-shape violations, no invalid auth methods, no duplicate
Entra identities.

Rollback: before any Entra user exists, reverting code is safe and the additive
schema can stay. After Entra users exist, do not deploy an image assuming
`password_hash NOT NULL`; disable SSO, keep the schema, and convert or remove
Entra users first if a full rollback is required. Do not drop SSO columns or
`auth_flows` while SSO users or sessions exist. Restoring `NOT NULL` on
`password_hash` is a data migration, not a schema rollback.

## API and route contract

Routes:

| Method | Path                              | Auth                | Throttle | Purpose                                    |
| ------ | --------------------------------- | ------------------- | -------- | ------------------------------------------ |
| GET    | `/auth/entra/login`               | public              | write    | Start flow, set binding cookie, redirect    |
| GET    | `/auth/entra/callback`            | public, state-bound | write    | Exchange code, create session              |
| GET    | `/auth/entra/logged-out`          | public              | read     | Post-logout landing, clear cookie          |
| GET    | `/auth/entra/frontchannel-logout` | public, `iss`+`sid` | write    | Phase 9, delete sessions by sid            |
| POST   | `/api/auth/logout`                | session or none     | write    | Local logout, optional `ssoLogoutUrl`      |
| DELETE | `/api/users/:id/sessions`         | admin               | write    | Revoke all sessions for a user             |
| GET    | `/api/users`                      | admin               | read     | Include `auth_source` and `entra_oid`       |
| POST   | `/api/users`                      | admin               | write    | Create local or Entra user                 |
| PATCH  | `/api/users/:id`                  | admin               | write    | Convert, correct oid, edit fields          |

Callback `sso` codes: `denied` (access denied or cancelled), `expired` (missing,
expired, replayed, or invalid state or binding), `no_access` (no active local
user), `unavailable` (discovery, token, JWKS, or DB unavailable), `failed`
(other safe failure), `logout` (post-logout landing), `disabled` (SSO disabled
mid-flow). The callback never reflects `error_description`. The login route
returns 404 when SSO is disabled, 303 to the validated `next` when already
authenticated, 429 on throttle exhaustion, 503 on flow store issues, and 500 on
configuration error. The logged-out route is public, clears the session cookie,
and redirects to `/login?sso=logout`.

`POST /api/auth/logout` response gains an optional `ssoLogoutUrl`, null for
local sessions, when SSO is disabled, or when the URL cannot be built safely.
The URL is built from configured values only and contains no email, oid, sid,
or token. No `id_token_hint` or `logout_hint`.

`DELETE /api/users/:id/sessions` returns `{ revoked }`, 404 for a missing user,
and logs an audit line with actor id, target id, and count. Self-revocation
ends the caller's session.

Admin user shape adds `auth_source: "local" | "entra"` and `entra_oid: string |
null`. Public shape adds `auth_source` only. `entra_tid`, `idp_sid_hash`,
tokens, and password hashes are never returned.

`POST /api/users` accepts either a local user (password required) or an Entra
user (`authSource: "entra"`, `entraObjectId` required, tenant from config, SSO
must be enabled). `authSource` defaults to `local`. Duplicate email returns the
existing 400; duplicate Entra identity returns a 400 naming the Object ID
without revealing the other user's email. `PATCH /api/users/:id` supports
conversion to Entra with `entraObjectId`, oid correction on an Entra user, and
rejects `authSource: "local"` in phase 1, password on an Entra target, and
conversion of the last active local admin. Every conversion or oid correction
revokes sessions in the same transaction.

Password routes: `/api/auth/login` treats SSO users like wrong passwords via the
dummy PBKDF2 path; `/api/auth/password` and admin password reset reject Entra
users with a 400.

Log events use the existing structured logger. Never log `code`, `state`,
`nonce`, `code_verifier`, tokens, claims, cookies, `oid`, `tid`, `sid`, email,
or the full callback URL.

## UI changes

`routes/login.tsx` computes `companyName`, `localEnabled`, `ssoEnabled`,
`ssoHref`, and `ssoError` (allowlisted code only). `ssoHref` is built from the
already validated `next`; the island never builds an auth URL from raw input.
If SSO config is invalid but local login is enabled, show "Login com Microsoft
indisponível" and keep the password form. If both are disabled, show a
maintenance message and log a configuration error.

`islands/LoginForm.tsx` adds `ssoEnabled`, `ssoHref`, `localEnabled`, and
`ssoError`. Show a full-width "Entrar com Microsoft" link above the password
form when SSO is enabled; show "ou" divider when both are enabled; hide the
email and password fields entirely when local login is disabled; map `ssoError`
codes to PT-BR messages with `role="alert"`; keep the existing busy state;
never prefill an email from the URL.

`AccountSection.tsx` hides the password form for Entra users and shows "Sua
conta usa Microsoft Entra ID. A senha é gerenciada pela sua organização."
`UsersManager.tsx` adds an auth-source badge, a create-method selector (local
password vs Entra Object ID), "Converter para Entra" and "Revogar sessoes"
actions, a copyable `entra_oid` field, and hides password reset for Entra
users. `AdminSection.tsx` and `SettingsPanel.tsx` thread `ssoEnabled`. All new
strings are PT-BR with no em dash or en dash. The Microsoft button is a link
with visible focus.

## Configuration

New `.env.example` keys (defaults keep existing deployments unaffected):

| Key                                    | Default | Required    | Notes                                              |
| -------------------------------------- | ------- | ----------- | -------------------------------------------------- |
| `AUTH_SSO_ENABLED`                     | `false` | no          | Enables the Entra button and routes                |
| `AUTH_LOCAL_ENABLED`                   | `true`  | no          | Must stay true in phase 1                          |
| `AUTH_ENTRA_TENANT_ID`                 | -       | when SSO on | Tenant GUID, never `common`                        |
| `AUTH_ENTRA_CLIENT_ID`                 | -       | when SSO on | Application (client) ID GUID                       |
| `AUTH_ENTRA_CLIENT_SECRET`             | -       | one cred    | Fallback only, at least 32 chars                   |
| `AUTH_ENTRA_PRIVATE_KEY_PATH`          | -       | one cred    | PEM PKCS#8 private key                             |
| `AUTH_ENTRA_CERTIFICATE_PATH`          | -       | one cred    | PEM public certificate                             |
| `AUTH_SSO_FORCE_ACCOUNT_PICKER`        | `true`  | no          | Adds `prompt=select_account`                       |
| `AUTH_SSO_FLOW_TTL_SECONDS`            | `600`   | no          | Clamp 120 to 900                                   |
| `AUTH_SSO_CLOCK_TOLERANCE_SECONDS`     | `60`    | no          | Clamp 0 to 300                                     |
| `AUTH_SSO_HTTP_TIMEOUT_MS`             | `10000` | no          | Clamp 1000 to 30000                                |
| `AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED` | `false` | no          | Phase 9 only                                       |
| `APP_BASE_URL`                         | -       | when SSO on | Public origin, HTTPS except localhost               |

Validation: booleans accept `1`, `true`, `0`, `false` case-insensitively; other
values are boot errors. When SSO is enabled, `APP_BASE_URL` must be an
absolute URL with no credentials, query, fragment, or path other than `/`, with
`https:` except `http://localhost` and `http://127.0.0.1`; tenant id and
client id must be GUIDs; exactly one credential method (key plus certificate,
or client secret) may be configured; secret files must exist, be regular
files, at most 64 KiB, with the expected PEM label; the certificate PEM body is
base64-decoded to DER and SHA-256 hashed for `x5t#S256`. `AUTH_LOCAL_ENABLED=false`
in phase 1 fails configuration. Redirect URIs are derived, never configured.
Do not read the key or certificate during config parsing; read them lazily and
cache. Add a separate `loadAuthConfig` with an injectable env getter for tests.

Secret files use repo-relative paths such as `./secrets/entra.key` and
`./secrets/entra.crt`; add `secrets/` to `.gitignore` and `.dockerignore`;
mount `./secrets:/app/secrets:ro` on the `app` service only; file permissions
`0600` on POSIX. Never bake secrets into the image or print them. Keep a client
secret in `.env` only and rotate with a coexistence window.

Doctor additions: validate config and redirect URIs when SSO is enabled; check
key and certificate readability, import, test signature, and expiry (report a
skip if X.509 parsing is unavailable); fetch discovery and JWKS with the
production timeout and report issuer, token endpoint host, and RS256 support;
compare the local clock to the HTTP `Date` header; check at least one active
local admin and `AUTH_LOCAL_ENABLED=true`; check `auth_flows`, `users.auth_source`,
`sessions.auth_method`, and constraints. Doctor never calls the token endpoint
with a real code.

## Entra app registration runbook

1. New registration, single tenant ("Accounts in this organizational directory
   only").
2. Web redirect URI `https://<public-host>/auth/entra/callback`; do not choose
   SPA.
3. Add `https://<public-host>/auth/entra/logged-out` as a second Web redirect
   URI.
4. Authentication blade: leave implicit grants unchecked; confirm whether the
   "ID tokens" checkbox is required (V1); leave front-channel logout URL empty
   until phase 9.
5. Certificates and secrets: preferred upload the public certificate and deploy
   the matching key and certificate; fallback create a client secret and store
   it in `.env`.
6. Token configuration: add optional `sid` if front-channel logout is planned;
   no groups or app roles in phase 1.
7. API permissions: none beyond OIDC; do not add `User.Read`.
8. Enterprise application: consider "Assignment required" with a pilot group.
9. Conditional Access: require MFA, compliant or hybrid-joined device if policy,
   block legacy authentication; test blocked sign-in returns `access_denied`.
10. At least two app registration owners; use PIM for credential changes.
11. Local development: add localhost redirect URIs for the ports used and set
    `APP_BASE_URL` accordingly; confirm the tenant allows HTTP localhost URIs
    (V9).
12. Rotation: upload the new certificate, deploy, verify, remove the old; for
    secrets, create a second, deploy, verify, remove the first after overlap.

`post_logout_redirect_uri` must match a registered redirect URI. If the tenant
rejects `/auth/entra/logged-out`, the fallback is to use the callback URI as
the post-logout target and detect the absence of `code`.

## Dependency decision

Proposed direct dependency: `openid-client` 6.8.8, pinned exactly. Transitive:
`jose` 6.2.13 and `oauth4webapi` 3.8.8. Total unpacked under 1 MB, no native
addon, uses `fetch` and WebCrypto. Verify published manifests for lifecycle
scripts and telemetry. Why not hand-roll: JWKS fetching, key selection,
signature verification, issuer/audience checks, clock skew, key rollover, PKCE,
state/nonce, redirect URI derivation, token endpoint errors, and client
assertion signing are security-critical. Why `openid-client`: OpenID Certified,
provider-agnostic, supports private key JWT, client secret post, PKCE S256,
nonce, state, and claim validation, Deno-compatible ESM. Alternatives rejected:
hand-rolled `jose`, `jose` only, MSAL Node, generic OAuth2 client, claims-only
validation. Add `"openid-client": "npm:openid-client@6.8.8"` to `deno.jsonc`;
regenerate `deno.lock` with `deno install`; import only from
`lib/server/auth/entra/*`; add auth routes to the `deno task check` glob;
measure bundle, image, and RSS before and after; add the three packages to the
dependency bulletins with version, license, and update owner. ADR D14 states
reason, size, maintainer health, license, permissions, alternatives, and
rollback.

## Threat model highlights

Protected assets: local identities and roles, session cookies and hashes,
password hashes, Entra Object ID and tenant mapping, admin actions, barrier data
and authored history, IdP credentials, logs. Trusted: app server, Postgres,
Entra tenant, operator. Untrusted: anonymous clients, non-admin users, a
compromised Entra account, a careless admin, networks, proxies, log sinks.
Entra is trusted for authentication but not authorization; local roles and
`active` remain authoritative.

Key controls: PKCE S256, one-time code, exact redirect URI, no code logging;
`state`, browser-binding cookie, `SameSite=Lax`, one-time consume; 256-bit
random state stored only as a hash; library signature validation, RS256 pin,
JWKS from discovery, exact issuer and audience; nonce stored with the flow;
fixed tenant issuer with no request-supplied issuer; `safeAuthNext` with origin
comparison; new random session token on every login; HttpOnly, Secure, SameSite
cookies, hash at rest, 12 h TTL, revoke endpoint; identity is `(tid, oid)` only,
no JIT, no email link; admin pre-provisioning plus local `active`; 12 h TTL,
admin revoke, optional front-channel logout later; hard guard plus CLI
break-glass; existing sessions stay valid during an SSO outage; write throttle,
10 min TTL, sweep, 10,000 row cap; no tokens, codes, states, claims, oids, or
emails in logs; certificate preferred, file permissions, read-only mount, no
logs; exact pin, lockfile, review, bulletin tracking. Security acceptance: no
session without a valid signature, exact issuer, correct audience, matching
`tid`, matching `nonce`, and a consumed unexpired flow; no callback can create a
session for a user other than the one mapped to `(tid, oid)`; no password route
accepts an Entra user; no admin path can remove the last active local admin;
no auth route logs a token, code, state, claim, email, or Object ID; no public
error reveals whether a user or Object ID exists.

## Privacy and LGPD highlights

New data: `auth_source`, `entra_tid`, `entra_oid` on `users` (life of the row);
`auth_method`, `idp_sid_hash` on `sessions` (12 h); `state_hash`,
`browser_hash`, `nonce`, `code_verifier`, `return_to` in `auth_flows` (10 min);
auth audit events in logs (owner-defined retention). Minimization: do not store
Entra `email`, `name`, `preferred_username`, `upn`, `groups`, `roles`, access
tokens, refresh tokens, or ID tokens. Local email and name are not overwritten.
`oid` is returned only on the admin list, never in `/api/auth/me` or a URL.

Legal: the owner and DPO must confirm the LGPD legal basis for workforce
authentication and for processing Entra identifiers; this plan does not make
that determination. Entra is a Microsoft cloud service; tenant region,
Microsoft's DPA, and any international transfer mechanism must be confirmed
before production (LGPD Art. 33 may apply). The app sends only OIDC protocol
data to Microsoft. No analytics, telemetry, or session replay on the login page.
Cookies `barrier_session` and `barrier_sso` are strictly necessary
authentication cookies. Update the privacy notice and data inventory. Define log
retention at deployment level. Data subject rights: access and correction via
admin screens; deleting a user row removes `entra_tid` and `entra_oid` and
cascades to sessions; authored barrier history is not deleted; logs may contain
numeric user id and request id only. Incident response: disable SSO, rotate
credentials, revoke sessions, review logs; do not delete logs during an
investigation.

## Failure modes and operations

Common failures map to generic PT-BR login errors: disabled SSO returns 404 and
no button; misconfiguration returns a notice with local login kept; discovery,
JWKS, or token endpoint failures return `unavailable`; invalid signature,
clock skew, and similar return `failed` or `expired`; expired, replayed, or
binding-mismatched flows return `expired`; unknown or inactive users return
`no_access`; DB unavailability returns 503; flow capacity returns 503 after one
sweep and retry; blocked cookies cause `expired` or a loop; expired
certificates block login.

Operational requirements: reliable NTP (skew above 60 s rejects valid tokens);
outbound HTTPS 443 to `login.microsoftonline.com` and the tenant's token and
JWKS hosts; no inbound connection from Microsoft for the code flow; proxy must
honor Deno `fetch` without disabling TLS verification (V8); reverse proxy logs
must redact the callback query string; HTTPS in production with `APP_BASE_URL`
as the public origin; no sticky sessions needed because flows and sessions are
in Postgres; backups must include `users`, `sessions`, and `auth_flows`; do
not run a pre-SSO image while Entra users exist. Monitoring: alert on repeated
`auth.entra.callback.error`, discovery failures, flow capacity, certificate
expiry within 30 days, and auth route 5xx. Log retention is defined at
deployment level.

Break-glass: use a local admin at `/login`; if the password is lost, run
`deno task admin:create` or reset via the admin API; if SSO config blocks
startup, set `AUTH_SSO_ENABLED=false`, restart, and use local login without
deleting the schema; block an Entra user immediately by deactivating the local
user or calling `DELETE /api/users/:id/sessions`, then disabling the Entra
account. Certificate and secret rotation uses overlapping credentials with
verification before removal.

## Performance and lightweight footprint

Initiation targets under 50 ms p95 (one Postgres insert, random generation,
redirect). Callback targets under 1 s p95 warm and under 3 s cold (one Postgres
delete, one token request, one signature verification, one user lookup, one
session insert, one redirect; Entra latency dominates). Dashboard requests
change only by two extra text columns in the existing session join, with no
per-request IdP call. Logout is one delete plus an optional navigation to
Entra; local logout does not wait for Entra. `auth_flows` rows are small and
expire in 10 minutes with a 10,000 cap. No token cache, refresh timer,
background worker, or new service. Discovery is cached one hour per instance;
JWKS caching is in the library. The dependency adds under 1 MB unpacked; measure
the built server bundle, container image, and startup RSS. The design is
stateless at the HTTP layer, so any instance can handle the callback. The flow
consume is a single atomic `DELETE ... RETURNING`. The global flow cap is a
deliberate single point of failure under attack and fails closed.

## Testing plan

Pure unit tests cover config parsing, `safeAuthNext`, authorization URL
construction, claim policy, error mapping, logout URL, PEM parsing and
thumbprint, and constant-time comparison. Database integration tests (self-skip
when `DATABASE_URL` is unset) cover flow insert/consume/replay/expiry/binding/
concurrency/sweep/capacity, shape constraints, duplicate Entra identity, session
insert and revoke, conversion, last-local-admin guards, oid correction, and
password reset rejection. A local fake OIDC provider on `127.0.0.1` (random
port) exposes discovery, JWKS, token, and optional authorize endpoints; tests
sign ID tokens with WebCrypto (RSASSA-PKCS1-v1_5, SHA-256) and cover success
and negative cases. Route and security-negative tests cover disabled SSO,
cookie and redirect behavior, replay/expiry/binding failures, unknown and
inactive users, password-route rejection, admin permissions, self-revocation,
last-local-admin guards, API shape leakage, and log redaction. Browser and
staging smoke covers sign-in, cookie attributes, logout, back-button behavior,
hidden password form, local admin sign-in, and callback replay. Verification
commands: `deno task check`, `deno task test`, `deno task build`,
`deno task doctor` against staging with SSO enabled, Docker build and size
comparison, and manual browser smoke. `deno task check` must include the new
auth routes; tests needing `AUTH_*` should prefer an injectable `EnvGetter`.

## Rollout and rollback

`AUTH_SSO_ENABLED=false` is the default; the button is hidden and auth routes
return 404. Existing Entra sessions remain valid when the flag is turned off by
design, to avoid mass logout during a temporary IdP outage; use the admin
revoke endpoint or SQL if immediate revocation is required. Turning the flag off
does not delete users, mappings, or sessions. Turning it on requires valid
config; otherwise auth routes fail closed and the login page shows a notice
while local login remains. `AUTH_LOCAL_ENABLED` must stay true in phase 1.

Rollback matrix: phase 0 discard the branch; phase 1 keep the additive schema;
phase 2 revert code with the flag off; phase 3 set the flag off; phase 4 hide
the button with the flag; phase 5 set the flag off; phase 6 revert docs; phase
7 set the flag off; phase 8 set the flag off and revoke Entra sessions if
needed. Never deploy a pre-SSO image while Entra users exist; disable the flag
and keep the new image instead.

Communication: announce the pilot with the tenant, expected Microsoft sign-in
screen, and local fallback; tell users their dashboard password does not change
until an admin converts their account; tell admins how to provision by Object
ID and revoke sessions; publish support paths for "no access" and "expired
flow"; do not include real Object IDs or emails in screenshots or tickets.

## Implementation phases

Phase 0, decisions and spike: approve or reject D13/D14 and the owner
decisions; create a dev app registration and test user; spike `openid-client`
6.8.8 on Deno for discovery, code exchange, ID token validation, private key
JWT with PS256, `aud` override, `x5t#S256`, logout URL, and the fake provider;
record results; no production code or schema change. Acceptance: a real dev
login completes end to end; exact redirect URI and PKCE; private key JWT
accepted or fallback chosen with approval; logout behavior documented.

Phase 1, schema and SQL: add columns, constraints, indexes, and `auth_flows`;
add `lib/server/sql/auth-flows.ts`; extend users and sessions SQL; add the
local-admin count and guard; add DB integration tests. Acceptance:
`db:migrate` succeeds on clean and pre-existing databases; `check` passes
including the migration-order guard; existing auth flows still pass; no behavior
change when SSO is off.

Phase 2, config and OIDC core: add `loadAuthConfig` and the Entra config
module; add key and certificate loading, thumbprint, discovery cache, safe
fetch, client auth, claim policy, and error mapping; add unit tests and the
fake provider; add `openid-client` and update the lockfile. Acceptance: config
validation rejects every missing or contradictory combination; fake provider
covers success and negatives; no token, code, state, or claim in test logs; no
client-bundled import.

Phase 3, auth routes and session: add login, callback, and logged-out routes;
add the binding cookie helper; add session creation with `auth_method='entra'`;
modify logout to return `ssoLogoutUrl`; add route tests; add auth routes to
`check`. Acceptance: a real dev login creates a working local session; replay,
expiry, wrong binding, unknown, and inactive users fail closed; existing
password login and logout still pass; callback sets `Cache-Control: no-store`
and `Referrer-Policy: no-referrer`.

Phase 4, login UI: extend `routes/login.tsx` and `islands/LoginForm.tsx`; add
the Microsoft button, local toggle, error mapping, and PT-BR copy. Acceptance:
button only when SSO enabled; local form only when local login enabled; error
codes render the correct message without reflecting raw input; acceptable
keyboard and screen-reader behavior.

Phase 5, admin provisioning and revocation: extend the users API and admin UI
for Entra creation, conversion, oid correction, and session revocation; hide
password reset for Entra users; hide the password form in `AccountSection`;
add the last-local-admin guard to every mutation path. Acceptance: an admin
can create an Entra user by Object ID and that user can log in; conversion
preserves id and history; the last active local admin cannot be removed by any
path; revocation invalidates cookies immediately; non-admins cannot act.

Phase 6, operations and documentation: update `.env.example`, readme, and docs;
add doctor checks; add proxy redaction and NTP notes; add the secret mount and
ignore files; add rotation runbook. Acceptance: a new operator can configure
from docs; doctor catches missing config, missing files, expired certificate,
clock skew, and no local admin; no secret is printed or shipped.

Phase 7, staging pilot: enable SSO for a small Entra group; run browser smoke,
rollback, revoke, and break-glass drills; measure latency, error rate, and
bundle size; confirm proxy log redaction. Acceptance: local admin and several
Entra users sign in; disabled and unprovisioned users fail closed; rotation
rehearsed; rollback flag tested.

Phase 8, production enablement: create the production app registration and
credentials; deploy schema and code with the flag off; run doctor; enable for
the pilot group then everyone; announce. Acceptance: doctor passes; at least one
local admin can sign in; Entra users can sign in and out; revocation works; no
unexpected auth errors.

Phase 9, optional later work (each needs its own decision and ADR): front-channel
logout with `sid`; Entra app roles or group-to-role mapping; SSO-only mode and
disabling local login; JIT provisioning or SCIM; a second provider; shorter
session TTL or idle timeout; seamless logout with a stored `id_token_hint`.

## File impact map

Key new files: `lib/server/sql/auth-flows.ts`,
`lib/server/auth/entra/{config,client,flows,claims,errors,logout,keys}.ts`,
`routes/auth/entra/{login,callback,logged-out,frontchannel-logout}.ts`,
`routes/api/users/[id]/sessions.ts`, and `lib/server/auth/constant-time.ts`.
Key modified files: `db/schema.sql`; `lib/server/sql/users.ts` and
`sessions.ts`; `lib/server/auth/session.ts`; `lib/server/auth.ts`;
`lib/server/page-auth.ts`; `lib/types.ts`; `lib/server/config.ts`;
`routes/api/auth/{login,password,logout,me}.ts`; `routes/api/users.ts` and
`[id].ts`; `routes/login.tsx`; `islands/LoginForm.tsx`;
`components/settings/{AccountSection,AdminSection}.tsx`;
`components/settings/admin/UsersManager.tsx`; `components/SettingsPanel.tsx`;
`routes/index.tsx`; `scripts/doctor.ts` and `create-admin.ts`; `deno.jsonc` and
`deno.lock`; `.env.example`; `compose.yml`; `.gitignore` and `.dockerignore`;
docs and tests. Do not modify `DECISIONS.md` until D13 and D14 are approved;
then append them without rewriting D01-D12.

## Owner decisions required

| ID  | Decision                                                   | Recommendation                        | Blocking |
| --- | ---------------------------------------------------------- | ------------------------------------- | -------- |
| O1  | Add Entra ID as a second sign-in method                    | Approve, ADR D13                      | Phase 0  |
| O2  | Adopt `openid-client` 6.8.8                                | Approve, ADR D14                      | Phase 0  |
| O3  | Client credential: certificate or client secret            | Certificate, secret as fallback       | Phase 0  |
| O4  | Keep local login and a local break-glass admin             | Keep both                             | Phase 0  |
| O5  | Provisioning by Object ID, no JIT, no email link           | Approve                               | Phase 0  |
| O6  | Roles local authoritative, no Entra app roles yet          | Approve                               | Phase 0  |
| O7  | Logout: local plus best-effort Entra with account picker   | Approve                               | Phase 0  |
| O8  | Session TTL for Entra users                                | Same 12 h, review later               | Phase 0  |
| O9  | Route namespace `/auth/entra/*`                            | Approve                               | Phase 0  |
| O10 | Correct an Entra Object ID after provisioning             | Allow with confirmation and revocation | Phase 5  |
| O11 | Require Entra app assignment and Conditional Access        | Yes for the pilot                     | Phase 7  |
| O12 | Privacy and international transfer sign-off                | Owner and DPO before production       | Phase 8  |
| O13 | Egress, proxy, NTP, and log redaction                      | Owner evidence before staging         | Phase 7  |
| O14 | Front-channel logout, SSO-only mode, app roles            | Defer                                 | Phase 9  |
| O15 | `AUTH_LOCAL_ENABLED=false`                                 | Do not support in phase 1             | Phase 0  |

## Verification and spike items

There are 20 items (V1-V20) to confirm from the tenant, the library, or the
deployment: whether the "ID tokens" checkbox is required (V1); whether `sid` is
present by default (V2); whether `post_logout_redirect_uri` must be registered
(V3); whether `openid-client` signs the assertion with PS256 and includes
`x5t#S256` (V4); whether Entra accepts `client_secret_post` (V5); full Deno
compatibility (V6); JWKS caching and key rollover (V7); Deno `fetch` proxy
support (V8); localhost redirect URIs allowed (V9); end-session without
`id_token_hint` (V10); presence of `azp`, `ver`, `auth_time`, and `sid` and
`prompt=select_account` behavior (V11); `iss` in the authorization response and
library handling (V12); front-channel logout payload (V13); disabling SSO
keeping sessions valid and revoke working (V14); key/certificate match in doctor
without a new dependency (V15); tenant assignment requirement and
`access_denied` (V16); `authorizationCodeGrant` accepting the synthetic callback
URL (V17); proxy logging and redaction of the callback query string (V18);
certificate expiry and rotation window (V19); NTP and outbound HTTPS on the
production host (V20). Record the result and date for each. If a spike fails:
do not silently switch to a less secure option; record the failure, version,
and error class; propose the smallest alternative such as `client_secret_post`;
do not hand-roll a replacement protocol stack.

## Draft ADRs (not appended)

Append only after owner approval; latest existing ADR is D12. Renumber if
another ADR lands first.

D13, Microsoft Entra ID OIDC as a second sign-in method: add Entra as a second
sign-in method using the authorization code flow with PKCE (S256), `state`,
`nonce`, an exact redirect URI, and `response_mode=query`; keep the opaque
session cookie and Postgres session store; do not store IdP tokens; map users
by `(tid, oid)`; provision by admin action only with no JIT and no email
auto-link; keep local roles authoritative and local password login plus at
least one active local admin as break-glass. Consequences: `users` gains
`auth_source`, `entra_tid`, `entra_oid` with `password_hash` nullable and an
exclusive shape constraint; `sessions` gains `auth_method` and optional
`idp_sid_hash`; new `auth_flows` table; Entra tokens, groups, app roles, SCIM,
and front-channel logout out of scope; residual risk of a disabled Entra
account keeping its local session until TTL or revocation.

D14, adopt `openid-client` for OIDC: add `openid-client` 6.8.8 as a direct
dependency pinned exactly, with `jose` and `oauth4webapi` transitively; use it
only in `lib/server/auth/entra/*`. Consequences: about 1 MB unpacked and a
small runtime memory increase; new supply-chain surface mitigated by exact pin,
lockfile, license review, and bulletin tracking; future upgrades are
security-sensitive.

## Risks and open questions

Risks: Entra configuration drift; certificate expiry; account mapping errors;
leaver exposure up to 12 h; log leakage; dependency or protocol regression;
local admin lockout; email collision; SSO-only pressure before a break-glass
design; legal uncertainty around LGPD basis and international transfer.

Open questions: which tenant and app registration are production and who are
the two owners; whether a pilot group is required; certificate or client
secret; whether 12 h TTL is acceptable; whether a Microsoft account picker on
logout is acceptable; whether admins may correct an Object ID; when local login
may be disabled; log retention policy and storage; outbound HTTPS, proxy, and
NTP availability; privacy notice update needed; front-channel logout timing.

## References

Microsoft: authorization code flow, OIDC protocol, ID token claims, ID tokens,
claims validation, signing key rollover, certificate credentials, app
registration security best practices, app roles, logout. Standards and library:
RFC 9700; `openid-client`, `oauth4webapi`, `jose`. Repository: `agents.md`,
`DECISIONS.md` (latest D12), `docs/ARCHITECTURE.md`, `docs/API.md`,
`docs/DATABASE.md`, `docs/DEPLOY-WINDOWS.md`, and
`docs/DEPENDENCY-SECURITY-BULLETINS.md`.

## Definition of done

D13 and D14 approved and appended to `DECISIONS.md`; schema migrates cleanly on
a copy of the production database; `deno task check` passes with the new auth
routes; `deno task test` passes with the fake provider and DB suites passing or
visibly skipping; `deno task build` passes and the client bundle does not import
server auth code; a real dev tenant login, logout, revoke, and rollback drill
pass; the last active local admin cannot be removed by any path; an Entra user
cannot use password login, password change, or admin password reset; no auth
route or log line contains a token, code, state, claim, email, or Object ID;
doctor passes in staging with SSO enabled; privacy notice and data inventory
updated or the reason recorded; rollback flag and emergency session revocation
SQL documented and rehearsed; owner accepts the residual leaver-session risk and
logout behavior.
