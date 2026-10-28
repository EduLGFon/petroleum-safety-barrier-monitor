# SSO with Microsoft Entra ID - implementation plan

Status: proposed, not approved. This document contains no implementation and
does not approve any decision. New sign-in methods and new dependencies require
an ADR and owner approval.

| Field               | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Date                | 2026-10-26                                                                |
| Repository snapshot | commit `2368be2`, clean before this document was added                    |
| Target              | Dashboard login through OpenID Connect with Microsoft Entra ID            |
| Constraints         | safe, secure, fast, lightweight, Deno-only, Postgres-backed sessions      |
| Approval needed     | ADR for the sign-in method, ADR for the dependency, owner decisions below |

Repository files may change before implementation. Re-read every file listed in
the impact map and re-run the verification items before starting a phase.

## Contents

- [Executive summary](#executive-summary)
- [Scope and non-goals](#scope-and-non-goals)
- [Current state](#current-state)
- [Target architecture](#target-architecture)
- [Identity and provisioning model](#identity-and-provisioning-model)
- [OIDC protocol design](#oidc-protocol-design)
- [Token validation](#token-validation)
- [Session model](#session-model)
- [Data model and migration](#data-model-and-migration)
- [API and route contract](#api-and-route-contract)
- [UI changes](#ui-changes)
- [Configuration](#configuration)
- [Entra app registration runbook](#entra-app-registration-runbook)
- [Dependency decision](#dependency-decision)
- [Threat model](#threat-model)
- [Privacy and LGPD](#privacy-and-lgpd)
- [Failure modes and operations](#failure-modes-and-operations)
- [Performance and lightweight footprint](#performance-and-lightweight-footprint)
- [Testing plan](#testing-plan)
- [Rollout and rollback](#rollout-and-rollback)
- [Implementation phases](#implementation-phases)
- [File impact map](#file-impact-map)
- [Owner decisions required](#owner-decisions-required)
- [Verification and spike items](#verification-and-spike-items)
- [Draft ADRs (not appended)](#draft-adrs-not-appended)
- [Risks and open questions](#risks-and-open-questions)
- [References](#references)
- [Definition of done](#definition-of-done)

## Executive summary

- Add Microsoft Entra ID as a second dashboard sign-in method using the
  authorization code flow with PKCE (S256), `state`, `nonce`, an exact redirect
  URI, and `response_mode=query`.
- Keep the existing opaque Postgres session and `barrier_session` cookie. The
  IdP tokens are used only inside the callback request and then discarded. No
  access token, refresh token, or ID token is stored.
- Keep local roles authoritative. Entra app roles, group claims, and automatic
  role mapping are out of scope for the first release.
- Provision Entra users by Object ID before first login. Do not create users
  just in time, and never auto-link an existing local account by email, UPN, or
  `preferred_username`.
- Keep local password login and at least one active local administrator as the
  break-glass path. Disabling local login is a separate decision and a separate
  ADR.
- Use `openid-client` 6.8.8 rather than hand-rolled JWT validation. It is MIT
  licensed, OpenID Certified, Deno-compatible, and adds `jose` plus
  `oauth4webapi` as transitive dependencies.
- Store short-lived authorization flows server-side in Postgres, keyed by a
  SHA-256 hash of `state`, with a browser-binding cookie hash. This works across
  multiple app instances without sticky sessions and avoids encrypted client
  cookies.
- Ship dark behind `AUTH_SSO_ENABLED=false`, pilot with a small Entra group,
  then enable for everyone. Existing sessions stay valid during rollout.

## Scope and non-goals

In scope:

- Entra ID OIDC login for the dashboard.
- Admin pre-provisioning by Entra Object ID.
- Conversion of an existing local user to Entra without losing the user id or
  authored history.
- Admin session revocation for users who have no local password reset path.
- Local password login remaining available as break-glass.
- Schema, API, UI, configuration, documentation, tests, and operations changes
  needed for the above.

Out of scope for the first release:

- Replacing `ADMIN_TOKEN` or using Entra for scripts and service calls.
- Microsoft Graph calls, access tokens, refresh tokens, or token caching.
- SCIM provisioning, automatic user creation, or automatic email linking.
- Entra group-to-role mapping, app roles, or PIM-driven authorization.
- Front-channel logout, back-channel logout, or continuous access evaluation.
- Multi-tenant sign-in, B2C, SAML, WS-Federation, or passwordless local login.
- Removing local password login or the local break-glass administrator.
- A new database, cache, queue, or background worker.

## Current state

The current authentication model is small and explicit:

| Area                  | Current behavior                                                                                                                    | File                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| User store            | `users` with unique lowercased `email`, `name`, `role` (`admin` or `user`), `active`, and `password_hash NOT NULL`                  | `db/schema.sql`                                       |
| Passwords             | PBKDF2-SHA256, 210,000 iterations, per-user salt, constant-time verification                                                        | `lib/server/auth/password.ts`                         |
| Sessions              | 32 random bytes in `barrier_session`, only the SHA-256 hash stored, 12 h fixed TTL                                                  | `lib/server/auth/session.ts`                          |
| Session store         | `sessions(user_id, token_hash, expires_at)` with cascade delete on user removal                                                     | `db/schema.sql`, `lib/server/sql/sessions.ts`         |
| Request auth          | `ADMIN_TOKEN` first, then cookie session; anonymous calls get 404 camouflage, dead credentials get 401                              | `lib/server/auth.ts`                                  |
| Page auth             | Server-side session gate for every page; `/login` is the only public page                                                           | `lib/server/page-auth.ts`                             |
| Local login           | Email plus password, generic 401, dummy PBKDF2 hash for unknown or inactive accounts                                                | `routes/api/auth/login.ts`                            |
| Logout                | Deletes the session row and clears the cookie                                                                                       | `routes/api/auth/logout.ts`                           |
| Self-service password | Session only, revokes every session including the caller's                                                                          | `routes/api/auth/password.ts`                         |
| Admin user changes    | Last active admin cannot be demoted, deactivated, or deleted; password resets and active-state changes revoke the target's sessions | `lib/server/sql/users.ts`, `routes/api/users/[id].ts` |
| Login UI              | Glass card with corporate email and password, localized errors, no self-registration                                                | `routes/login.tsx`, `islands/LoginForm.tsx`           |
| Admin UI              | User list, creation, role changes, password reset                                                                                   | `components/settings/admin/UsersManager.tsx`          |

Constraints that shape the design:

- `users.password_hash` is currently `NOT NULL`. SSO-only users need a nullable
  hash and a database constraint that keeps local and Entra rows structurally
  distinct.
- `sessions` has no auth method or IdP session identifier. Both are needed for
  auditing and for a later front-channel logout.
- `ADMIN_TOKEN` bypasses user identity and must never be accepted as an SSO
  credential or mapped to a user.
- The app has no global security headers. Auth routes can set their own
  `Cache-Control`, `Referrer-Policy`, and framing headers without changing the
  rest of the app.
- `deno task check` type-checks `routes/api/*` but not `routes/auth/*`. The
  implementation must extend the check glob or the new routes will not be
  type-checked.
- `deno task test` allows network only to `127.0.0.1` and `localhost`, so the
  fake OIDC provider must run locally.
- `docs/todo.md` is empty at this snapshot. The phase list below is the proposed
  task order; the owner may copy it there after approval.
- The latest ADR is D12. Draft D13 and D14 are included at the end of this
  document and must not be appended to `DECISIONS.md` until approved.

## Target architecture

```text
Browser                    App (Fresh/Deno)                     Microsoft Entra ID
   |                              |                                      |
   | GET /auth/entra/login?next=  |                                      |
   |----------------------------->|                                      |
   |                              | insert auth_flows row                |
   |                              | set barrier_sso binding cookie       |
   | 302 authorize?client_id=...  |                                      |
   |<-----------------------------|                                      |
   |-------------------------------------------------------------------->|
   |                              |                                      |
   | GET /auth/entra/callback?code=...&state=...                         |
   |----------------------------->|                                      |
   |                              | consume flow by state hash           |
   |                              | compare binding hash                 |
   |                              | token exchange + PKCE + client auth  |
   |                              |------------------------------------->|
   |                              | validated ID token claims            |
   |                              |<-------------------------------------|
   |                              | map (tid, oid) to local user         |
   |                              | insert opaque session                |
   | 303 next + Set-Cookie        |                                      |
   |<-----------------------------|                                      |
```

The browser never receives an Entra token. It receives the same opaque
`barrier_session` cookie used today. Every dashboard request continues to
resolve that cookie in Postgres; no request goes to Entra after login.

Components:

| Component                                  | Responsibility                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `lib/server/config.ts`                     | Parse and validate auth configuration without reading secret files       |
| `lib/server/auth/entra/config.ts`          | Entra-specific config shape, issuer, redirect URIs, credential selection |
| `lib/server/auth/entra/client.ts`          | Discovery, cached configuration, safe fetch, client authentication       |
| `lib/server/auth/entra/flows.ts`           | State, nonce, PKCE, binding cookie, flow lifecycle                       |
| `lib/server/auth/entra/claims.ts`          | Post-validation claim policy and identity extraction                     |
| `lib/server/auth/entra/errors.ts`          | Stable internal reason codes and public error mapping                    |
| `lib/server/auth/entra/logout.ts`          | Entra end-session URL, best effort                                       |
| `lib/server/sql/auth-flows.ts`             | `auth_flows` insert, atomic consume, sweep, capacity check               |
| `routes/auth/entra/login.ts`               | Flow start and redirect to Entra                                         |
| `routes/auth/entra/callback.ts`            | Code exchange, validation, user mapping, session creation                |
| `routes/auth/entra/logged-out.ts`          | Registered post-logout landing; clears any local session                 |
| `routes/auth/entra/frontchannel-logout.ts` | Optional later phase; hidden iframe endpoint                             |

Design principles:

1. Reuse the existing session model. Do not introduce a second cookie, a JWT
   session, or a client-side token.
2. Fail closed. A missing config, missing claim, failed signature, expired flow,
   or unknown user never produces a session.
3. Minimize data. Store only the tenant id, Object ID, auth source, and an
   optional hash of the Entra session id. Do not store tokens, emails from
   Entra, names from Entra, groups, or roles.
4. Keep the trust boundary server-side. The browser cannot choose the issuer,
   redirect URI, tenant, role, or local user id.
5. Keep the first release small. No new service, no background job, no token
   cache, no refresh flow, no Graph permission.
6. Make rollback a configuration change, not a database rewrite.

## Identity and provisioning model

The stable identity key is the pair `(tid, oid)` from the ID token:

- `tid` is the Entra tenant id. It must equal `AUTH_ENTRA_TENANT_ID`.
- `oid` is the user object id in that tenant. It is immutable for the lifetime
  of the account in that tenant.
- `sub` is present and validated, but not stored. It is pairwise per app and is
  not needed once `oid` is known.
- `email`, `preferred_username`, `upn`, and `name` are display or contact data.
  They are never used to find, link, create, or authorize a user.

Provisioning rules:

- An administrator creates the local user before the first Entra login and
  enters the Entra Object ID. The tenant comes from configuration, never from
  the request body.
- There is no just-in-time provisioning. An unknown `(tid, oid)` gets the same
  generic "no access" result as an inactive user.
- There is no email auto-link. If a local user with the same email exists, the
  administrator must convert that row explicitly. Automatic linking would let
  anyone who can control an Entra account with a matching email take over the
  local account, including its authored history.
- The local `email` remains the canonical address for display and operational
  mail. Login does not overwrite it from Entra. A mismatch between the local
  email and the Entra UPN is allowed and is an administrative concern, not an
  authentication signal.
- Entra guests are supported if the administrator provisions the Object ID that
  appears in the resource tenant. Guest Object IDs are tenant-specific.
- If an Entra user is deleted and recreated, the new account has a new Object
  ID. The administrator must update the mapping; the old mapping fails closed.
- Roles remain local and authoritative. A user with Entra login has exactly the
  same local `admin` or `user` role semantics as a password user. Entra app
  roles and group claims are a later, separate decision.
- The local `active` flag remains authoritative. Removing the Entra assignment
  or disabling the Entra account does not delete the local user or invalidate
  an existing local session immediately. See the residual risk section.

### Local-to-Entra conversion

Conversion preserves `users.id`, so `barrier_status_history.author_id` and any
other authored references stay intact. The operation:

1. Requires an admin session and the target user id.
2. Rejects the change if the target is the last active local administrator.
3. Sets `auth_source='entra'`, `entra_tid` from config, `entra_oid` from the
   validated request, and `password_hash=NULL`.
4. Revokes every session for the target in the same transaction.
5. Writes an audit log line with actor id, target id, and action, but no
   Object ID and no email.
6. Returns the updated admin user shape.

Conversion back to local is not supported in the first release. An
administrator who needs a local account again can create one with
`scripts/create-admin.ts` or the admin users API. This avoids re-introducing a
password path through a conversion endpoint.

## OIDC protocol design

Use the authorization code flow with PKCE. Do not use implicit or hybrid flow.
Do not request `offline_access`. Do not store tokens.

Authorization request parameters:

| Parameter               | Value                                | Notes                                               |
| ----------------------- | ------------------------------------ | --------------------------------------------------- |
| `response_type`         | `code`                               | Server-side code exchange only                      |
| `client_id`             | `AUTH_ENTRA_CLIENT_ID`               | Application (client) ID, a GUID                     |
| `redirect_uri`          | `{APP_BASE_URL}/auth/entra/callback` | Exact match, no query, no fragment                  |
| `scope`                 | `openid profile`                     | Minimal. `profile` is required for `oid` and `name` |
| `state`                 | 32 random bytes, base64url           | Stored as SHA-256 hash                              |
| `nonce`                 | 32 random bytes, base64url           | Stored with the flow, checked on the ID token       |
| `code_challenge`        | S256 of the verifier                 | Verifier is 32 random bytes, base64url              |
| `code_challenge_method` | `S256`                               | Never `plain`                                       |
| `response_mode`         | `query`                              | Top-level GET; compatible with `SameSite=Lax`       |
| `prompt`                | `select_account` when enabled        | Controlled by `AUTH_SSO_FORCE_ACCOUNT_PICKER`       |

Do not send `login_hint`, `domain_hint`, `max_age`, `claims`, `acr_values`, or
`offline_access` in the first release. Do not accept an authorization endpoint
or issuer from the request.

Why `response_mode=query`:

- Entra supports `query` for the code flow.
- The callback is a top-level cross-site GET, so the `SameSite=Lax` binding
  cookie is sent.
- `form_post` would be a cross-site POST and would require `SameSite=None` or a
  different binding mechanism, increasing complexity and risk.
- The authorization code is single-use, PKCE-bound, and short-lived. The main
  residual risk is the code appearing in proxy logs or browser history. Both
  are addressed by `Referrer-Policy: no-referrer`, immediate redirect, and
  proxy query-string redaction for the callback path.

### Flow start

`GET /auth/entra/login?next=/path`:

1. If SSO is disabled, return the same 404 shape as a missing route.
2. If the caller already has a valid session, redirect to a validated `next`
   or `/`. Do not start a second flow while authenticated.
3. Apply the write throttle.
4. Validate `next` with the stricter `safeAuthNext` described below.
5. Generate `state`, browser binding token, `nonce`, and PKCE verifier with
   `crypto.getRandomValues`.
6. Insert the flow row with hashes, TTL, and the sanitized return target.
7. Set the binding cookie and redirect to the authorization URL with 302.
8. Set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The flow row:

- `state_hash`: SHA-256 hex of `state`.
- `browser_hash`: SHA-256 hex of the binding token.
- `nonce`: plaintext nonce, needed for the token check.
- `code_verifier`: plaintext PKCE verifier, needed for the token exchange.
- `return_to`: sanitized local path.
- `created_at`, `expires_at`: fixed 10 minute TTL by default.

The binding cookie:

- Name: `barrier_sso`.
- Value: 32 random bytes, base64url or hex.
- `HttpOnly`, `SameSite=Lax`, `Path=/auth/entra`, `Max-Age` equal to the flow
  TTL, `Secure` when the request or `APP_BASE_URL` is HTTPS.
- No `Domain` attribute.
- Cleared with an expired cookie on callback completion, success or failure.

Why a server-side flow plus binding cookie:

- The flow survives multiple app instances because the state is in Postgres.
- The state hash is useless if the database leaks, because the browser holds the
  preimage.
- The binding cookie prevents an attacker from injecting a callback into a
  victim's browser even if the attacker learns `state`.
- The flow is consumed atomically with `DELETE ... RETURNING`, so replay finds
  no row.

### Callback

`GET /auth/entra/callback?code=...&state=...`:

1. If SSO is disabled, return 404.
2. Apply the write throttle.
3. Reject missing, duplicated, or oversized query parameters. Bound `code` to
   4096 characters and `state` to 256 characters.
4. If `error` is present, do not exchange anything. Log only the error code,
   consume or discard the flow when possible, clear the binding cookie, and
   redirect to a generic login error.
5. Atomically consume the flow by `state_hash`, regardless of binding result.
   A valid state is one-time even if the binding comparison fails.
6. Compare `browser_hash` in constant time. A mismatch is a generic expired or
   invalid flow error.
7. Build a synthetic callback URL from the configured redirect URI plus only
   `code` and `state`. Do not pass the raw request URL; unknown parameters such
   as `session_state` can break exact `redirect_uri` derivation.
8. Exchange the code with `authorizationCodeGrant` and the checks below.
9. Validate the ID token policy.
10. Map `(tid, oid)` to an active local user. Unknown and inactive both map to
    the same public error.
11. Create a new opaque session with `auth_method='entra'` and an optional
    `idp_sid_hash`.
12. Clear the binding cookie, set the session cookie, and redirect with 303 to
    the stored `return_to`.

The callback never accepts a user id, email, role, tenant, or redirect target
from the query. The only accepted inputs are the protocol parameters.

If `iss` is present in the authorization response, compare it to the configured
issuer before the token exchange. Do not pass it to the library unless the
spike confirms that the installed version handles it without changing the
derived `redirect_uri`. This is verification item V12.

### Return target validation

Reuse the intent of `safeNext`, but add a stricter server-side function for
SSO flows, for example `safeAuthNext(raw, appBaseUrl)`:

- Empty or missing: `/`.
- Must start with a single `/`.
- Reject `//`, backslashes, control characters, and any scheme.
- Reject after percent-decoding if the decoded value starts with `//` or
  contains a backslash.
- Reject `/login`, `/auth/`, and `/api/` prefixes.
- Maximum 2048 characters.
- Parse with `new URL(value, appBaseUrl)` and require the origin to equal the
  configured app origin.
- Store only the path and query, never an absolute URL.

The client-side `safeNext` in `LoginForm` is a convenience mirror, not the
security control. The server validates again before storing and before
redirecting.

### Discovery and caching

- Issuer: `https://login.microsoftonline.com/{AUTH_ENTRA_TENANT_ID}/v2.0`.
- Discovery document:
  `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`.
- Never use `common` or `organizations`. A single tenant id prevents
  multi-tenant sign-in and makes the issuer exact.
- Cache the discovered `Configuration` in module memory for one hour. Reset the
  cache on discovery failure. JWKS caching and key rollover are handled by the
  library; verify the behavior in the spike.
- Fetch timeouts are 10 seconds by default. Use `AbortSignal.timeout` and a
  custom `fetch` that rejects redirects, so a compromised or misconfigured
  endpoint cannot bounce the request to another host.
- `AUTH_SSO_HTTP_TIMEOUT_MS` is in milliseconds. Convert it to seconds before
  passing it to the library's `timeout` option; the library expects seconds.
- Register `redirect_uris`, `response_types: ["code"]`,
  `token_endpoint_auth_method`, `id_token_signed_response_alg: "RS256"`, and
  `clockTolerance` in the client metadata. The tolerance is 60 seconds unless
  `AUTH_SSO_CLOCK_TOLERANCE_SECONDS` overrides it.
- Do not pre-warm discovery during boot. A cold start must not depend on Entra
  availability. The first login pays the discovery cost.

## Token validation

`openid-client` validates the protocol mechanics. The application adds a small
policy layer. Both are required.

Library responsibilities:

- Verify the ID token signature against the tenant JWKS.
- Enforce the expected issuer and audience.
- Check `exp`, `nbf`, and `iat` with the configured clock tolerance.
- Check `nonce` against `expectedNonce`.
- Check `state` against `expectedState`.
- Send the stored PKCE verifier with the code exchange; Entra validates it
  against the challenge.
- Validate `azp` when present.
- Reject unsigned tokens and algorithms not allowed by the provider metadata.

Application policy, after `claims()` returns:

| Check    | Rule                              | Failure      |
| -------- | --------------------------------- | ------------ |
| Issuer   | Exact configured tenant v2 issuer | Reject       |
| Audience | Contains the configured client id | Reject       |
| `tid`    | Equals `AUTH_ENTRA_TENANT_ID`     | Reject       |
| `oid`    | Non-empty GUID                    | Reject       |
| `sub`    | Non-empty string                  | Reject       |
| `ver`    | `2.0`                             | Reject       |
| `nonce`  | Matches the consumed flow         | Reject       |
| `azp`    | Absent, or equals the client id   | Reject       |
| `exp`    | In the future after tolerance     | Reject       |
| `iat`    | Not unreasonably in the future    | Reject       |
| `sid`    | Optional string; hash if present  | No rejection |

Do not accept `email`, `preferred_username`, `upn`, `name`, `roles`, or
`groups` as identity or authorization inputs in the first release. They may be
logged only as absent or present booleans, never as values.

### Client authentication

Prefer certificate credentials with `private_key_jwt`:

- `AUTH_ENTRA_PRIVATE_KEY_PATH` points to a PEM PKCS#8 private key.
- `AUTH_ENTRA_CERTIFICATE_PATH` points to the matching PEM certificate.
- The public certificate is uploaded to the Entra app registration.
- The client assertion uses `PS256` as recommended by Microsoft.
- The assertion `aud` is the token endpoint, not the issuer. `oauth4webapi`
  defaults to the issuer, so override it in `modifyAssertion`.
- The assertion `iss` and `sub` are the client id.
- The assertion includes `typ: JWT`, `x5t#S256` (base64url SHA-256 of the
  certificate DER), a short `exp`, and a unique `jti`.
- The private key is imported for RSA-PSS with SHA-256, not RSASSA-PKCS1-v1_5.

Fallback: `client_secret_post` with `AUTH_ENTRA_CLIENT_SECRET`. Do not use
`client_secret_basic` unless the spike proves it is required. A client secret
is a shared bearer secret stored in `.env`; it is operationally simpler but
less resistant to leakage than a certificate. Exactly one credential method is
configured at a time. Configuring both is a boot error.

Illustrative client assertion sketch, to be checked against v6.8.8:

```ts
const clientAuth = PrivateKeyJwt(privateKey, {
  [modifyAssertion]: (header, payload) => {
    header.typ = "JWT";
    header.alg = "PS256";
    header["x5t#S256"] = certificateThumbprint;
    payload.aud = configuration.server.metadata.token_endpoint;
    payload.iss = clientId;
    payload.sub = clientId;
  },
});
```

The token endpoint response is read only for `claims()`. Access tokens and
refresh tokens are not read, logged, cached, or persisted. The response object
goes out of scope at the end of the callback.

### Failure handling

- Map library errors to stable internal reasons such as `discovery_failed`,
  `token_request_failed`, `invalid_signature`, `invalid_claims`,
  `unknown_user`, `inactive_user`, `flow_expired`, `flow_replayed`, and
  `binding_mismatch`.
- Log the reason, request id, and error class name. Do not log the error
  message, response body, URL, code, state, token, claims, email, or Object ID.
- Public errors are generic. The login page receives a short code, never a raw
  provider message.
- A misconfiguration logs loudly on the server and returns a generic 500 or
  503. It never falls back to an insecure mode.

## Session model

Successful Entra login creates the same kind of row as password login:

- `sessions.user_id`: local user id.
- `sessions.token_hash`: SHA-256 of the new opaque token.
- `sessions.expires_at`: now plus 12 hours, unchanged.
- `sessions.auth_method`: `entra`.
- `sessions.idp_sid_hash`: SHA-256 of a domain-separated `tid:sid` string when
  `sid` is present, otherwise `NULL`.

The cookie remains `barrier_session` with `HttpOnly`, `SameSite=Lax`, `Path=/`,
and `Secure` on HTTPS. Every login mints a new token, so session fixation is not
possible. There is no sliding expiration; the fixed 12 hour TTL is the current
contract.

Logout:

- Local logout deletes the session row and clears the cookie. This is the
  security boundary.
- For an Entra session, `POST /api/auth/logout` also returns a best-effort
  `ssoLogoutUrl` pointing at the Entra end-session endpoint with
  `post_logout_redirect_uri` set to `/auth/entra/logged-out`.
- The client navigates to that URL after the local logout succeeds. If the user
  stays on the app, the local session is already gone.
- No `id_token_hint` is sent because no ID token is stored. Entra may show an
  account picker or may not fully end its own session. This is accepted for the
  first release. Seamless Microsoft logout is an owner decision.
- `/auth/entra/logged-out` must be registered as a redirect URI in the app
  registration. Verify this with the portal and the spike before relying on it.
- The logged-out route clears any local session cookie it receives, then
  redirects to `/login?sso=logout`. It must not require authentication.

Session revocation:

- `DELETE /api/users/:id/sessions` revokes every session for a user and returns
  the number revoked. This is required because an Entra user has no local
  password reset that would otherwise force revocation.
- Admins can revoke their own sessions; the UI warns that this logs them out.
- A later front-channel logout can call the same SQL helper by `idp_sid_hash`.

Residual risk: an Entra account disabled in the tenant keeps its existing local
session until the 12 hour TTL expires, unless an administrator revokes it or a
later front-channel logout is enabled. Conditional Access sign-in frequency
does not retroactively invalidate local sessions. Document this in the runbook
and keep the TTL under review.

## Data model and migration

The schema change is additive and idempotent. It follows the repository rule
that every index appears after the `ALTER TABLE ... ADD COLUMN` stanzas that
create its columns, so `scripts/check-migration-order.ts` passes on both a clean
database and a pre-existing one.

Proposed `db/schema.sql` changes, placed in the users and sessions section:

```sql
-- Auth source: local password or Microsoft Entra ID. Existing rows are local.
alter table users add column if not exists auth_source text not null default 'local';
alter table users add column if not exists entra_tid text;
alter table users add column if not exists entra_oid text;

-- SSO users have no local password.
alter table users alter column password_hash drop not null;

alter table users drop constraint if exists users_auth_source_valid;
alter table users add constraint users_auth_source_valid
  check (auth_source in ('local', 'entra'));

-- A local user must have a password and no Entra identity.
-- An Entra user must have an Entra identity and no password.
alter table users drop constraint if exists users_auth_source_shape;
alter table users add constraint users_auth_source_shape check (
  (auth_source = 'local'
    and password_hash is not null
    and entra_tid is null
    and entra_oid is null)
  or
  (auth_source = 'entra'
    and password_hash is null
    and entra_tid is not null
    and entra_oid is not null)
);

create unique index if not exists idx_users_entra_identity
  on users (entra_tid, entra_oid)
  where auth_source = 'entra';

-- Session auth method and optional IdP session id hash.
alter table sessions add column if not exists auth_method text not null default 'password';
alter table sessions add column if not exists idp_sid_hash text;

alter table sessions drop constraint if exists sessions_auth_method_shape;
alter table sessions add constraint sessions_auth_method_shape check (
  auth_method in ('password', 'entra')
  and (auth_method <> 'password' or idp_sid_hash is null)
  and (idp_sid_hash is null or idp_sid_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists idx_sessions_idp_sid
  on sessions (idp_sid_hash)
  where idp_sid_hash is not null;

-- Short-lived OIDC authorization flows. State and browser binding are stored
-- as SHA-256 hashes; only the preimage in the browser can use a row.
create table if not exists auth_flows (
  state_hash    text        primary key,
  browser_hash  text        not null,
  nonce         text        not null,
  code_verifier text        not null,
  return_to     text        not null default '/',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  check (state_hash ~ '^[0-9a-f]{64}$'),
  check (browser_hash ~ '^[0-9a-f]{64}$'),
  check (char_length(nonce) between 32 and 128),
  check (char_length(code_verifier) between 43 and 128),
  check (return_to like '/%' and return_to not like '//%'
    and char_length(return_to) <= 2048)
);

create index if not exists idx_auth_flows_expires on auth_flows (expires_at);
```

Notes:

- `ADD COLUMN ... NOT NULL DEFAULT 'local'` backfills existing rows in
  Postgres 11 and later without a table rewrite.
- `DROP NOT NULL` is idempotent. Re-applying it is safe.
- Dropping and re-adding the two check constraints takes a brief lock. The
  users table is small. If that changes, add the constraint with `NOT VALID` and
  validate in a second statement.
- The unique partial index is the database-level guarantee against two local
  rows claiming the same Entra identity. Application validation is still
  required for a clean error message.
- `auth_flows` stores no IP address, user agent, email, or token. The return
  target is a local path and may contain dashboard filters, which are not
  authentication data.
- The `idp_sid_hash` index is only needed for front-channel logout. It is small
  and can stay if that phase is expected; otherwise add it in phase 9.
- Do not add a foreign key from `auth_flows` to `users`; the user is not known
  until the callback succeeds.

Migration verification, run once on a copy before production:

```sql
-- Every existing user must be a valid local user.
select count(*) from users
where auth_source <> 'local' or password_hash is null
   or entra_tid is not null or entra_oid is not null;

-- Every session must have a valid auth method.
select count(*) from sessions where auth_method not in ('password', 'entra');

-- No duplicate Entra identity.
select entra_tid, entra_oid, count(*)
from users
where auth_source = 'entra'
group by 1, 2
having count(*) > 1;
```

All three must return zero rows or zero. The first query must be zero before
the shape constraint is added on a pre-existing database; the default handles
it, but verify rather than assume.

### Flow SQL

Insert:

```sql
insert into auth_flows
  (state_hash, browser_hash, nonce, code_verifier, return_to, expires_at)
values ($1, $2, $3, $4, $5, $6::timestamptz);
```

Atomic consume. Delete first, compare the binding hash in the application:

```sql
delete from auth_flows
where state_hash = $1 and expires_at > now()
returning browser_hash, nonce, code_verifier, return_to;
```

Deleting by state alone means a stolen state cannot be retried indefinitely,
and a binding mismatch consumes the flow. The state is 256 bits of randomness,
so the lookup itself does not leak whether a state existed beyond the generic
error path.

Sweep and capacity:

```sql
delete from auth_flows where expires_at <= now();

select count(*)::text as n from auth_flows;
```

The login route sweeps expired rows before inserting. If the table is at the
global cap (proposed 10,000 rows), it sweeps once and retries. If it is still at
the cap, it fails closed with a generic 503 and logs `flow_capacity`. This is a
denial-of-service guard, not a normal operating limit.

### User and session SQL

New or changed queries:

```sql
-- Lookup by stable Entra identity. Never fall back to email.
select id, email, name, password_hash, role, active,
       auth_source, entra_tid, entra_oid
from users
where auth_source = 'entra' and entra_tid = $1 and entra_oid = $2;

-- Revoke every session for one user.
delete from sessions where user_id = $1 returning id;

-- Revoke by IdP session id hash, for a later front-channel logout.
delete from sessions where idp_sid_hash = $1 returning id;

-- Local admin guard.
select count(*)::text as n from users
where role = 'admin' and active and auth_source = 'local';
```

`lockActiveAdmins` already locks every active admin row. Keep that lock and add
`countActiveLocalAdmins(query)` immediately after it. Because both counts are
read under the same row locks, two concurrent conversions, demotions, or
deletions cannot both pass the local-admin guard.

The existing last-active-admin guard stays. The new guard is additional:

- An operation cannot remove the last active admin of any auth source.
- An operation cannot remove the last active local admin while local login is
  the break-glass path.

The second rule blocks converting, demoting, deactivating, or deleting the last
active local admin even when an Entra admin remains. The error message is
explicit so the administrator knows to create or promote another local admin
first.

### Rollback

- Before any Entra user exists, reverting the code is safe. The added columns
  and tables are unused and can stay.
- After Entra users exist, do not deploy an image that assumes
  `password_hash NOT NULL`. Disable SSO, keep the schema, and convert or remove
  Entra users first if a full code rollback is required.
- Do not write a rollback migration that drops `auth_source`, `entra_tid`,
  `entra_oid`, `auth_method`, or `auth_flows` while SSO users or sessions exist.
- Restoring the `NOT NULL` constraint on `password_hash` requires every SSO user
  to have a password again, which contradicts the SSO-only account model. Treat
  it as a data migration, not a schema rollback.

## API and route contract

All new routes are provider-specific under `/auth/entra/*`. This avoids
ambiguity with `/api/auth/*` and leaves room for a future second provider.

| Method | Path                              | Auth                  | Throttle | Purpose                                          |
| ------ | --------------------------------- | --------------------- | -------- | ------------------------------------------------ |
| GET    | `/auth/entra/login`               | public                | write    | Start a flow, set binding cookie, redirect       |
| GET    | `/auth/entra/callback`            | public, state-bound   | write    | Exchange code, create local session              |
| GET    | `/auth/entra/logged-out`          | public                | read     | Post-logout landing, clear local cookie          |
| GET    | `/auth/entra/frontchannel-logout` | public, `iss` + `sid` | write    | Optional phase 9, delete sessions by sid         |
| POST   | `/api/auth/logout`                | session or none       | write    | Local logout, return optional `ssoLogoutUrl`     |
| DELETE | `/api/users/:id/sessions`         | admin                 | write    | Revoke every session for a user                  |
| GET    | `/api/users`                      | admin                 | read     | Include `auth_source` and `entra_oid`            |
| POST   | `/api/users`                      | admin                 | write    | Create local or Entra user                       |
| PATCH  | `/api/users/:id`                  | admin                 | write    | Convert local to Entra, correct oid, edit fields |

### `GET /auth/entra/login`

Request: optional `next` query parameter.

Success: `302` to the Entra authorization endpoint, `Set-Cookie`
`barrier_sso=...; Path=/auth/entra; HttpOnly; SameSite=Lax; Max-Age=600` plus
`Secure` when applicable.

Responses:

- `404` when SSO is disabled or the path is probed without a configured
  provider.
- `303` to the validated `next` when the caller already has a session.
- `429` when the write throttle is exhausted.
- `503` when the flow store is unavailable or at capacity.
- `500` for a configuration error, with a generic body and a server log.

Headers: `Cache-Control: no-store`, `Pragma: no-cache`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

### `GET /auth/entra/callback`

Request: `code` and `state`, or `error`, `error_description`, `state`.

Success: `303` to the stored `return_to`, `Set-Cookie` for
`barrier_session`, and an expired `barrier_sso` cookie.

Failure: `303` to `/login?sso=<code>` with an expired binding cookie. It does
not return a JSON error envelope because this is a browser navigation, not an
API call. The login page maps the short code to PT-BR text.

Allowed `sso` codes:

| Code          | Meaning                                                  | PT-BR message                                                  |
| ------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `denied`      | Entra returned `access_denied` or the user cancelled     | Acesso cancelado ou negado pela Microsoft.                     |
| `expired`     | Missing, expired, replayed, or invalid state or binding  | A sessão de login expirou. Tente novamente.                    |
| `no_access`   | No active local user for this Entra identity             | Sua conta não tem acesso ao monitor. Procure um administrador. |
| `unavailable` | Discovery, token endpoint, JWKS, or database unavailable | Não foi possível concluir o login. Tente novamente.            |
| `failed`      | Any other safe failure                                   | Não foi possível concluir o login. Tente novamente.            |
| `logout`      | Post-logout landing                                      | Sessão encerrada.                                              |
| `disabled`    | SSO disabled while a flow was in progress                | Login com Microsoft indisponível.                              |

The callback never reflects `error_description`. It logs the provider error
code only, and only after validating its length and character set.

### `GET /auth/entra/logged-out`

- Public.
- Reads `barrier_session` if present, deletes that session row, and clears the
  cookie.
- Redirects to `/login?sso=logout` with `303`.
- `Cache-Control: no-store`.
- Hitting this URL logs the browser out locally even if Entra did not redirect
  from a real logout. That is a low-severity logout CSRF, accepted because the
  route is the registered post-logout target and local logout is idempotent.
  Do not add a CSRF token that would break the Entra redirect.

### `GET /auth/entra/frontchannel-logout` (phase 9 only)

- Enabled only by `AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED=true`.
- Requires `iss` exactly equal to the configured issuer and `sid` a bounded
  string.
- Hashes the sid with the same domain separation used at login, deletes matching
  sessions, and returns `200` with a small `text/html` body.
- Sends `Content-Security-Policy: frame-ancestors https://login.microsoftonline.com`
  and `Cache-Control: no-store`.
- Does not require or set cookies. It does not log the sid or the number of
  sessions deleted.
- Returns `200` even when no session matched, so Entra does not retry and an
  attacker cannot probe whether a sid exists.

### `POST /api/auth/logout`

The existing behavior stays. The response body gains an optional field:

```json
{
  "ok": true,
  "ssoLogoutUrl": "https://login.microsoftonline.com/.../logout?post_logout_redirect_uri=..."
}
```

- `ssoLogoutUrl` is `null` for local sessions, when SSO is disabled, or when the
  URL cannot be built safely.
- The logout route resolves the session user before deleting the row so it knows
  the auth method. If the delete fails, it returns the existing 500 and does not
  clear the cookie.
- The URL is built from configured values only. It contains no email, oid, sid,
  or token.
- Do not include `id_token_hint`. Do not include `logout_hint` with an email or
  UPN.
- Existing clients that ignore the extra field keep working.

### `DELETE /api/users/:id/sessions`

- Admin only, write throttle, `parseIdParam`.
- Returns `{ revoked: <count> }`.
- `404` when the user does not exist.
- Logs an audit line with actor id, target id, and count. No email or Object ID.
- The UI must confirm self-revocation and redirect to `/login` when the caller
  revokes their own sessions.

### Admin user shapes

`GET /api/users` returns the admin shape:

```ts
interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  created_at: string;
  auth_source: "local" | "entra";
  entra_oid: string | null;
}
```

`GET /api/auth/me` and `POST /api/auth/login` return the public shape:

```ts
interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  created_at: string;
  auth_source: "local" | "entra";
}
```

`entra_tid` is not returned because it is deployment configuration. `oid` is
returned only on the admin list, where it is needed to verify or correct a
mapping. `idp_sid_hash`, session tokens, and password hashes are never returned.

### `POST /api/users`

Body union:

```ts
type CreateUserBody =
  | {
    email: string;
    name?: string;
    role?: "admin" | "user";
    authSource?: "local";
    password: string;
  }
  | {
    email: string;
    name?: string;
    role?: "admin" | "user";
    authSource: "entra";
    entraObjectId: string;
  };
```

- `authSource` defaults to `local`, preserving the existing contract.
- Local: password is required and validated by `validateNewPassword`.
- Entra: password and `passwordHash` are forbidden; `entraObjectId` is required
  and validated as a GUID; tenant comes from config; SSO must be enabled.
- Duplicate email returns the existing friendly 400.
- Duplicate Entra identity returns a 400 that says the Object ID is already
  mapped, without revealing the other user's email.
- `createUser` is extended, not replaced. Existing script callers continue to
  create local users.

### `PATCH /api/users/:id`

Existing fields stay. New fields:

- `authSource: "entra"` plus `entraObjectId`: convert a local user or correct
  the Object ID of an existing Entra user.
- `authSource: "local"`: rejected in phase 1 with a clear 400.
- `entraObjectId` alone on an Entra user: allowed as a correction; revokes
  sessions.
- `password` on an Entra user: rejected with a 400.
- Conversion of the last active local admin: rejected before any write.
- Every conversion or oid correction revokes the target's sessions in the same
  transaction.

`PATCH` must not allow a caller to set `entra_tid`, `password_hash`,
`auth_source` without a valid shape, or any field that would break the database
constraints.

### Password routes

- `POST /api/auth/login` loads the user, and if `auth_source !== 'local'` or
  `password_hash` is null, verifies the dummy PBKDF2 hash and returns the same
  generic 401 as a wrong password. This keeps timing and enumeration behavior
  unchanged.
- `POST /api/auth/password` rejects an Entra user with a 400 before calling
  `verifyPassword`; the message says the password is managed by the
  organization.
- `PATCH /api/users/:id` with `password` rejects an Entra target before calling
  `verifyPassword`.

### Log events

Use the existing structured logger. Proposed events:

| Event                        | Level         | Fields                                     |
| ---------------------------- | ------------- | ------------------------------------------ |
| `auth.entra.login.start`     | info          | `requestId`, `returnTo` present boolean    |
| `auth.entra.login.redirect`  | debug         | `requestId`                                |
| `auth.entra.callback.ok`     | info          | `requestId`, `userId`, `authMethod`        |
| `auth.entra.callback.denied` | warn          | `requestId`, reason code                   |
| `auth.entra.callback.error`  | warn or error | `requestId`, reason code, error class name |
| `auth.entra.user.unmapped`   | warn          | `requestId` only                           |
| `auth.entra.logout`          | info          | `requestId`, `userId`                      |
| `auth.user.convert`          | audit         | `requestId`, actor id, target id           |
| `auth.user.sessions.revoke`  | audit         | `requestId`, actor id, target id, count    |
| `auth.entra.flow.capacity`   | error         | `requestId`, current count                 |

Never log `code`, `state`, `nonce`, `code_verifier`, tokens, claims, cookies,
`oid`, `tid`, `sid`, email, or the full callback URL. The existing logger
redacts common secret keys, but that is not a substitute for not passing them.

## UI changes

The login page must present one or two methods clearly without leaking whether
a given email exists.

`routes/login.tsx` computes server-side props:

```ts
interface LoginPageProps {
  companyName: string;
  localEnabled: boolean;
  ssoEnabled: boolean;
  ssoHref: string; // /auth/entra/login?next=<encoded safe next>
  ssoError: string | null; // allowlisted code only
}
```

Rules:

- `ssoHref` is built from the already validated `next`. The island never
  constructs an auth URL from raw query input.
- `ssoError` is the value of `?sso=` only when it is in the allowlist. Unknown
  values are ignored, never reflected.
- If SSO config is invalid but local login is enabled, show a small
  "Login com Microsoft indisponível" notice and keep the password form.
- If both methods are disabled, the page shows a maintenance message and the
  server logs a configuration error. Do not loop or auto-redirect.

`islands/LoginForm.tsx`:

- Add `ssoEnabled`, `ssoHref`, `localEnabled`, and `ssoError` props.
- When SSO is enabled, show a full-width "Entrar com Microsoft" link above the
  password form. Use an inline mark or plain text, not an external image or
  script.
- When both are enabled, show a divider with "ou".
- When local login is disabled, hide the email and password fields entirely.
  Do not render disabled inputs that suggest a hidden path.
- Map `ssoError` codes to the PT-BR messages from the API table. Use
  `role="alert"` for the existing error box.
- Preserve the existing busy state for the password form. The SSO link is a
  normal navigation, so it does not need a fetch spinner, but it can set a
  short "Redirecionando..." state on click.
- Keep `autoComplete="email"` and `autoComplete="current-password"` for the
  local form. Never prefill an email from the URL.

`components/settings/AccountSection.tsx`:

- If `sessionUser.authSource === "entra"`, hide the password form and show:
  "Sua conta usa Microsoft Entra ID. A senha é gerenciada pela sua
  organização."
- Keep the profile summary and role badge.
- Do not show a disabled password form; it invites support tickets.

`components/settings/admin/UsersManager.tsx`:

- Add an auth-source badge: `Local` or `Entra`.
- Add a create-method selector: "Senha local" or "Microsoft Entra".
  - Local shows the existing password and confirmation fields.
  - Entra shows an Object ID field with GUID validation and helper text
    explaining where to find it in the Entra admin center.
- Add a "Converter para Entra" action for local users with a confirmation that
  names the consequences: password removed, sessions revoked, login starts
  using Microsoft.
- Add a "Revogar sessoes" action for every user, with a confirmation. If the
  target is the current user, warn that the current session ends immediately.
- Show `entra_oid` for Entra users in a monospace, copyable field. Do not show
  it in the main list row; keep the row compact.
- Hide the password reset action for Entra users.
- Surface API errors verbatim only when they are known, safe messages. The API
  already returns English messages that the UI localizes for the last-admin
  case; extend that mapping for "last active local admin" and "user signs in
  with Microsoft Entra".

`components/settings/AdminSection.tsx` and `SettingsPanel.tsx`:

- Thread `ssoEnabled` from the page into the admin section so the Entra create
  and convert actions are hidden when SSO is off.
- Do not gate security on this prop; the API enforces the same rule.

Accessibility and copy:

- The Microsoft button is a link with visible focus, not a script-only div.
- Error text is associated with the form and announced.
- All new user-visible strings are PT-BR and follow the no em dash, no en dash
  rule.
- Do not use the Microsoft logo in a way that implies the app is a Microsoft
  product. A simple "Entrar com Microsoft" label is enough.

## Configuration

New `.env.example` keys. Defaults are chosen so an existing deployment is
unaffected.

| Key                                    | Default | Required       | Secret | Notes                                              |
| -------------------------------------- | ------- | -------------- | ------ | -------------------------------------------------- |
| `AUTH_SSO_ENABLED`                     | `false` | no             | no     | Enables the Entra button and routes                |
| `AUTH_LOCAL_ENABLED`                   | `true`  | no             | no     | Must stay true in phase 1; false is a separate ADR |
| `AUTH_ENTRA_TENANT_ID`                 | -       | when SSO on    | no     | Tenant GUID, never `common`                        |
| `AUTH_ENTRA_CLIENT_ID`                 | -       | when SSO on    | no     | Application (client) ID GUID                       |
| `AUTH_ENTRA_CLIENT_SECRET`             | -       | one credential | yes    | Fallback only; at least 32 characters              |
| `AUTH_ENTRA_PRIVATE_KEY_PATH`          | -       | one credential | path   | PEM PKCS#8 private key                             |
| `AUTH_ENTRA_CERTIFICATE_PATH`          | -       | one credential | path   | PEM public certificate                             |
| `AUTH_SSO_FORCE_ACCOUNT_PICKER`        | `true`  | no             | no     | Adds `prompt=select_account`                       |
| `AUTH_SSO_FLOW_TTL_SECONDS`            | `600`   | no             | no     | Clamp 120 to 900                                   |
| `AUTH_SSO_CLOCK_TOLERANCE_SECONDS`     | `60`    | no             | no     | Clamp 0 to 300                                     |
| `AUTH_SSO_HTTP_TIMEOUT_MS`             | `10000` | no             | no     | Clamp 1000 to 30000                                |
| `AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED` | `false` | no             | no     | Phase 9 only                                       |
| `APP_BASE_URL`                         | -       | when SSO on    | no     | Public origin, HTTPS except localhost              |

Validation rules:

- `AUTH_SSO_ENABLED` and `AUTH_LOCAL_ENABLED` accept `1`, `true`, `0`, `false`
  case-insensitively. Anything else is a boot error.
- If SSO is enabled:
  - `APP_BASE_URL` is required and must be an absolute URL with no credentials,
    query, fragment, or path other than `/`.
  - The protocol must be `https:`, except `http://localhost` and
    `http://127.0.0.1` for development.
  - `AUTH_ENTRA_TENANT_ID` and `AUTH_ENTRA_CLIENT_ID` must be GUIDs.
  - Exactly one credential method is configured: key plus certificate, or
    client secret. Both is an error. Neither is an error.
  - Secret files must exist, be regular files, be at most 64 KiB, and contain
    the expected PEM label. The key is imported with WebCrypto at first use and
    cached.
  - The certificate PEM body is base64-decoded to DER, hashed with SHA-256, and
    encoded as base64url for `x5t#S256`. No X.509 parser is needed at runtime.
- If `AUTH_LOCAL_ENABLED=false` in phase 1, configuration fails with a message
  that this requires a separate break-glass ADR. This prevents an accidental
  lockout.
- Redirect URIs are derived, never configured separately:
  - `redirectUri = new URL("/auth/entra/callback", appBaseUrl)`
  - `postLogoutRedirectUri = new URL("/auth/entra/logged-out", appBaseUrl)`
- Do not read the private key or certificate during config parsing. Read them
  lazily in the Entra client and cache the result. This keeps `/login` fast and
  avoids failing every route when only SSO is broken.
- `loadServerConfig` keeps its current responsibilities. Add a separate
  `loadAuthConfig` with an injectable env getter for tests. Do not make every
  API route parse SSO settings.

Secret files and Docker:

- Use repo-relative paths such as `./secrets/entra.key` and
  `./secrets/entra.crt`. The app workdir is `/app` in the image and the repo
  root on the host, so the same relative path works in both.
- Add `secrets/` to `.gitignore` and `.dockerignore`.
- Mount `./secrets:/app/secrets:ro` on the `app` service only. The poller and
  alert services do not need IdP credentials. `compose.dev.yml` already
  bind-mounts the repo, so the same relative path works in development.
- File permissions: `0600` on POSIX, restricted ACL on Windows. The container
  reads the files as the runtime user.
- Never bake the key or certificate into the image, and never print their
  contents in logs or doctor output.
- If a client secret is used instead, keep it in `.env` only and rotate it with
  a coexistence window.

`scripts/doctor.ts` additions:

- When SSO is enabled, validate the full config and both redirect URIs.
- Check that the key and certificate are readable, the key imports, a test
  signature verifies with the certificate public key, and the certificate is
  not expired. If X.509 parsing is unavailable, report that the expiry check
  was skipped rather than claiming success.
- Fetch discovery and JWKS with the production timeout. Report the issuer,
  token endpoint host, and whether `id_token_signing_alg_values_supported`
  contains `RS256`. Do not print tokens or keys.
- Compare the local clock to the HTTP `Date` header and warn when the skew is
  above the configured tolerance.
- Check that at least one active local admin exists and that `AUTH_LOCAL_ENABLED`
  is true.
- Check that `auth_flows`, `users.auth_source`, `sessions.auth_method`, and the
  relevant constraints exist.
- Never call the token endpoint with a real code. Doctor is a preflight, not a
  login test.

## Entra app registration runbook

The owner or tenant administrator performs these steps. Record the tenant id,
client id, credential thumbprint, and redirect URIs in the deployment notes,
not in the repository.

1. Open the Microsoft Entra admin center, then App registrations, then New
   registration.
2. Name it for the environment, for example `Barrier Monitor SSO - Production`.
3. Supported account types: "Accounts in this organizational directory only
   (single tenant)".
4. Redirect URI: platform `Web`, value
   `https://<public-host>/auth/entra/callback`. Do not choose "Single-page
   application"; the code exchange is server-side.
5. After creation, add `https://<public-host>/auth/entra/logged-out` as a second
   Web redirect URI. Microsoft requires the post-logout target to be registered
   as a redirect URI. Verify this in the portal for the tenant.
6. Authentication blade:
   - Leave implicit grant for access tokens and ID tokens unchecked.
   - Confirm whether the "ID tokens" checkbox is required for the authorization
     code flow in this tenant. Microsoft documentation has changed on this
     point. This is verification item V1.
   - Leave the front-channel logout URL empty until phase 9.
7. Certificates and secrets:
   - Preferred: upload the public certificate (`.cer` or `.crt`), record the
     thumbprint, and deploy the matching private key and certificate to the app.
   - Fallback: create a client secret, copy the value once, and store it in
     `.env` as `AUTH_ENTRA_CLIENT_SECRET`. Record the expiry date.
8. Token configuration:
   - Add the optional `sid` claim if front-channel logout is planned.
   - Do not add groups or app roles in phase 1.
   - Do not enable excessive optional claims.
9. API permissions:
   - No Microsoft Graph application or delegated permission is needed.
   - The `openid` and `profile` scopes are part of the OIDC request. Do not add
     `User.Read` just to read the profile; the ID token already carries the
     claims this app uses.
10. Enterprise application:
    - Consider "Assignment required" with a pilot group. This is an additional
      gate in front of the app and does not replace the local `active` flag.
    - Assign the pilot group before the staging test, then expand after
      approval.
11. Conditional Access:
    - Require MFA for the app.
    - Require a compliant or hybrid-joined device if that is the tenant policy.
    - Block legacy authentication.
    - Test that a blocked or interrupted sign-in returns a clean `access_denied`
      path and a generic PT-BR message.
12. Owners:
    - At least two app registration owners.
    - Use PIM or the tenant's privileged access process for credential changes.
13. Local development:
    - Add `http://localhost:8300/auth/entra/callback` and
      `http://localhost:8300/auth/entra/logged-out` to the dev app registration
      if `deno task preview` or `deno task start` is used.
    - For `deno task dev`, add `http://localhost:5173/...` and set
      `APP_BASE_URL=http://localhost:5173`.
    - Confirm that the tenant allows HTTP localhost redirect URIs. This is
      verification item V9.
14. Rotation:
    - Certificates: upload the new public certificate, deploy the new key and
      certificate paths, verify a login, then remove the old certificate.
    - Secrets: create the new secret, deploy it, verify, then delete the old
      secret after the overlap window.
    - Never rotate by editing the lockfile, image, or database.

Logout registration check:

- `post_logout_redirect_uri` must match a registered redirect URI. If the
  tenant rejects `/auth/entra/logged-out`, the fallback is to use the callback
  URI as the post-logout target and have the callback detect the absence of
  `code` and redirect to login. That fallback is less clean; verify before
  implementation rather than guessing.

## Dependency decision

Proposed direct dependency: `openid-client` 6.8.8, pinned exactly.

| Package         | Version | License | Unpacked size | Role                                                                  |
| --------------- | ------- | ------- | ------------- | --------------------------------------------------------------------- |
| `openid-client` | 6.8.8   | MIT     | about 222 KB  | OIDC discovery, authorization URL, code exchange, ID token validation |
| `jose`          | 6.2.13  | MIT     | about 218 KB  | JWT and JWKS primitives, transitive                                   |
| `oauth4webapi`  | 3.8.8   | MIT     | about 326 KB  | OAuth 2.0 and OIDC protocol primitives, transitive                    |

Total unpacked addition is under 1 MB. The design needs no native addon and no
new persistence engine. The packages use `fetch` and WebCrypto, which Deno
provides. Verify the published manifests for lifecycle scripts and telemetry
during the dependency review; do not assume the registry summary covers them.
Runtime memory impact is small, but the server bundle will include the library
because the auth routes are part of the app.

Why not hand-roll:

- ID token validation needs JWKS fetching, key selection, signature
  verification, issuer and audience checks, clock skew, and key rollover.
- The code flow needs PKCE, state and nonce handling, exact redirect URI
  derivation, token endpoint error handling, and client assertion signing.
- These are security-critical protocol details. A hand-rolled implementation
  would need its own test matrix and would still be less reviewed than a
  certified library.

Why `openid-client`:

- OpenID Certified and actively maintained.
- Provider-agnostic, so a future second provider does not require a second
  protocol stack.
- Supports private key JWT, client secret post, PKCE S256, nonce, state, and
  ID token claim validation.
- Deno-compatible ESM with WebCrypto and `fetch`.
- Small transitive footprint: one JWT library and one OAuth protocol library,
  both by the same maintainer ecosystem.

Alternatives considered:

| Alternative                      | Why not                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Hand-rolled with `jose`          | Still hand-rolls discovery, token exchange, PKCE, state, and client assertions                |
| `jose` only                      | Good JWT primitives, not an OIDC client                                                       |
| MSAL Node                        | Node-oriented, token-cache and Graph focused, heavier than needed for a server-side code flow |
| A generic OAuth2 client          | Less OIDC validation and less provider coverage                                               |
| No library, validate claims only | Unacceptable: signature and key rollover are mandatory                                        |

Implementation requirements:

- Add `"openid-client": "npm:openid-client@6.8.8"` to `deno.jsonc`. Pin the exact
  version because this is authentication code. Do not use a caret range.
- Regenerate `deno.lock` with `deno install`; never hand-edit it.
- Import the library only from `lib/server/auth/entra/*`. Never from
  `islands/`, `components/`, `hooks/`, or any client-bundled module.
- Add the new auth routes to the `deno task check` glob, for example
  `routes/auth/*/*.ts routes/auth/*/*/*.ts`.
- Measure `_fresh/server.js`, the Docker image, and process RSS before and
  after. Record the numbers in the ADR or the implementation change.
- Add `openid-client`, `jose`, and `oauth4webapi` to
  `docs/DEPENDENCY-SECURITY-BULLETINS.md` with version, license, and update
  owner.
- Review the packages' permissions: network access to the configured issuer and
  token endpoint, plus WebCrypto. No filesystem access beyond the key and
  certificate paths read by our own code.

ADR D14 must state the reason, size, maintainer health, license, permissions,
alternatives, and rollback. The owner approves it before the dependency lands.

## Threat model

Protected assets:

- Local user identities and roles.
- Session cookies and session hashes.
- Password hashes for local users.
- Entra Object ID and tenant mapping.
- Admin actions: user creation, conversion, role changes, session revocation.
- Barrier data and authored history reachable after login.
- IdP client credentials: private key or client secret.
- Logs, which must not become a secondary copy of auth material.

Trusted and untrusted actors:

- Trusted: the app server, the Postgres database, the Entra tenant, the
  deployment operator.
- Untrusted: anonymous internet clients, authenticated non-admin users, a
  compromised Entra user account, a malicious or careless admin, the network
  between browser and app, the network between app and Entra, and any proxy or
  log sink that records URLs.
- The Entra tenant is trusted for authentication but not for authorization.
  Local roles and the local `active` flag remain authoritative.

| Threat                                  | Impact                                           | Control                                                                                   | Residual                                                |
| --------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Authorization code interception         | Account takeover                                 | PKCE S256, one-time code, exact redirect URI, no code logging                             | Proxy logs may still see a single-use code; redact them |
| Authorization code replay               | Session forgery                                  | One-time code at Entra, one-time local flow                                               | None beyond Entra behavior                              |
| Login CSRF or callback injection        | Victim logged into attacker account              | `state`, browser-binding cookie, `SameSite=Lax`, one-time consume                         | Low                                                     |
| State fixation or guessing              | Flow hijack                                      | 256-bit random state, stored only as hash                                                 | Negligible                                              |
| ID token forgery or algorithm confusion | Account takeover                                 | Library signature validation, RS256 pin, JWKS from discovery, exact issuer and audience   | Depends on library correctness and key rollover         |
| Nonce replay                            | Token replay                                     | Nonce stored with flow and checked by library                                             | None                                                    |
| Mix-up attack or malicious issuer       | Token from wrong IdP accepted                    | Fixed tenant issuer in config, no request-supplied issuer, single provider                | None                                                    |
| Open redirect after login               | Phishing bounce                                  | `safeAuthNext`, stored return target, origin comparison, reject `/auth`, `/api`, `/login` | Low                                                     |
| Session fixation                        | Hijacked pre-login session                       | New random session token on every login                                                   | None                                                    |
| Session theft                           | Account takeover                                 | HttpOnly, Secure on HTTPS, SameSite=Lax, hash at rest, 12 h TTL, revoke endpoint          | Stolen cookie works until TTL or revocation             |
| Email or UPN auto-link                  | Account takeover via lookalike email             | Identity is `(tid, oid)` only; no JIT; no email link                                      | Admin mapping errors remain possible                    |
| Unprovisioned Entra user                | Unauthorized access                              | Admin pre-provisioning, local `active`, optional Entra assignment                         | Misconfiguration can over-grant                         |
| Leaver keeps local session              | Unauthorized access after disable                | 12 h TTL, admin revoke, optional front-channel logout later                               | Up to 12 h unless revoked                               |
| Last local admin lockout                | Loss of administration                           | Hard guard plus CLI break-glass                                                           | Requires operator access to the host                    |
| SSO outage                              | Login unavailable                                | Existing sessions stay valid, local break-glass remains                                   | Entra users cannot start new sessions                   |
| Flow table flooding                     | Database growth or login DoS                     | Write throttle, 10 min TTL, sweep, 10,000 row cap                                         | Distributed attack can still consume the cap            |
| Log leakage                             | Credential or PII exposure                       | No tokens, codes, states, claims, oids, or emails in logs; proxy redaction                | Third-party log sinks are outside app control           |
| Secret leakage                          | Client impersonation                             | Certificate preferred, file permissions, read-only mount, no logs                         | Host compromise remains fatal                           |
| Dependency compromise                   | Supply chain                                     | Exact pin, lockfile, review, bulletin tracking, minimal deps                              | Upstream compromise remains possible                    |
| Logout CSRF                             | Nuisance logout                                  | Low impact, idempotent, `SameSite` cookies                                                | Accepted                                                |
| Front-channel iframe abuse              | Forced logout or session probing                 | Validate `iss`, unguessable `sid`, CSP `frame-ancestors`, always 200                      | Only in phase 9                                         |
| Clock skew                              | Valid tokens rejected or expired tokens accepted | 60 s tolerance, NTP requirement, doctor check                                             | Misconfigured host clock                                |
| Database compromise                     | Session forgery or PII exposure                  | Only hashes stored, short-lived flows, no tokens, no IdP secrets in DB                    | OID and tenant mapping are exposed                      |

Security acceptance criteria:

- No session is created without a valid signature, exact issuer, correct
  audience, matching `tid`, matching `nonce`, and a consumed unexpired flow.
- No callback can create a session for a user other than the one mapped to
  `(tid, oid)`.
- No password route accepts an Entra user.
- No admin path can remove the last active local admin.
- No auth route logs a token, code, state, claim, email, or Object ID.
- No public error reveals whether a user or Object ID exists.

## Privacy and LGPD

New personal data:

| Data                         | Where        | Purpose                               | Retention                   |
| ---------------------------- | ------------ | ------------------------------------- | --------------------------- |
| `auth_source`                | `users`      | Distinguish local from Entra accounts | Life of the user row        |
| `entra_tid`                  | `users`      | Tenant binding and unique identity    | Life of the user row        |
| `entra_oid`                  | `users`      | Stable Entra identity                 | Life of the user row        |
| `auth_method`                | `sessions`   | Audit and rollback analysis           | Session TTL, 12 h           |
| `idp_sid_hash`               | `sessions`   | Optional front-channel logout mapping | Session TTL, 12 h           |
| `state_hash`, `browser_hash` | `auth_flows` | CSRF and flow binding                 | 10 min                      |
| `nonce`, `code_verifier`     | `auth_flows` | OIDC and PKCE                         | 10 min                      |
| `return_to`                  | `auth_flows` | Post-login navigation                 | 10 min                      |
| Auth audit events            | Logs         | Security investigation                | Owner-defined log retention |

Data minimization:

- Do not store Entra `email`, `name`, `preferred_username`, `upn`, `groups`,
  `roles`, access tokens, refresh tokens, or ID tokens.
- The local email and name remain the app's contact data. They are not
  overwritten by Entra.
- `oid` is returned only on the admin user list. It is not exposed to the
  authenticated user's own `/api/auth/me` response and is never placed in a URL.

Legal and transfer considerations:

- Authentication is necessary to provide the workforce dashboard. The owner and
  DPO must confirm the applicable LGPD legal basis for workforce authentication
  and for processing Entra identifiers. This plan does not make that legal
  determination.
- Microsoft Entra ID is a Microsoft cloud service. The tenant's region,
  Microsoft's data protection addendum, and any international transfer mechanism
  must be confirmed by the owner and DPO before production. LGPD Art. 33 may
  apply to international transfers.
- The app sends only OIDC protocol data to Microsoft: client id, redirect URI,
  state, nonce, PKCE challenge, and the authorization code. It does not send
  barrier data, user lists, or operational content.
- Do not add analytics, telemetry, or session replay to the login page.

Cookies and notices:

- `barrier_session` and `barrier_sso` are strictly necessary authentication
  cookies. They are HttpOnly and are not used for advertising or analytics.
- Update the privacy notice or internal data inventory with the Entra
  identifiers, the Microsoft processor relationship, and the session TTL.
- Define log retention. The app currently has no automated log retention; the
  owner must set one for the deployment. Do not claim a legal retention period
  in code comments.

Data subject rights:

- Access and correction go through the admin user management screen.
- Deletion of a user row removes `entra_tid` and `entra_oid` and cascades to
  sessions. Auth flows expire within 10 minutes.
- Authored barrier history is not deleted with the user because it is
  operational safety records. Confirm the retention basis with the owner and
  DPO; do not silently cascade-delete history.
- Logs may contain the numeric user id and request id. They must not contain
  email, Object ID, or tokens.

Incident response:

- Suspected client secret or private key compromise: disable SSO, rotate the
  credential, revoke all Entra sessions, review auth logs, and re-enable after
  verification.
- Suspected Entra tenant compromise: disable SSO, use the local break-glass
  admin, revoke Entra sessions, and follow the tenant incident process.
- Suspected local session theft: revoke the user's sessions, review logs, and
  rotate `ADMIN_TOKEN` if it may have been exposed.
- Do not delete logs during an investigation.

## Failure modes and operations

| Failure                  | User sees                             | System behavior                                       | Operator action                              |
| ------------------------ | ------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| SSO disabled             | No Microsoft button; direct route 404 | Local login unaffected                                | Enable flag after config validation          |
| SSO misconfigured        | Generic login unavailable notice      | Auth routes 500/503; server log names the missing key | Fix env, run doctor, restart                 |
| Entra discovery timeout  | `unavailable`                         | No flow exchange; existing sessions unaffected        | Check egress, proxy, Entra status            |
| JWKS fetch failure       | `unavailable`                         | No session created                                    | Check egress and key rollover                |
| Token endpoint 5xx       | `unavailable`                         | No session created; code is single-use                | Retry login later                            |
| Invalid signature        | `failed`                              | Reject; log reason and error class only               | Check tenant, client id, clock, key rollover |
| Clock skew               | `failed` or `expired`                 | Reject outside tolerance                              | Fix NTP                                      |
| Flow expired             | `expired`                             | No session; binding cookie cleared                    | Retry                                        |
| Flow replayed            | `expired`                             | No session; no row                                    | Investigate if repeated                      |
| Binding mismatch         | `expired`                             | Flow consumed, no session                             | Investigate if repeated                      |
| Unknown Entra user       | `no_access`                           | No session; no user created                           | Provision by Object ID                       |
| Inactive local user      | `no_access`                           | No session                                            | Reactivate or deny                           |
| Database unavailable     | 503                                   | No session; login cannot proceed                      | Restore DB                                   |
| Flow table at capacity   | 503                                   | Sweep and retry once, then fail closed                | Inspect for abuse or stuck rows              |
| Cookie blocked           | `expired` or login loop               | No session                                            | Allow first-party cookies                    |
| Entra logout unavailable | Local logout still succeeds           | `ssoLogoutUrl` navigation fails or stays on Entra     | Local logout is the boundary                 |
| Certificate expired      | Login fails                           | No session                                            | Rotate certificate                           |

Operational requirements:

- NTP or another reliable clock source on the host. A skew above 60 seconds
  causes valid tokens to be rejected; a large negative skew could extend token
  acceptance, so keep the tolerance small.
- Outbound HTTPS 443 to `login.microsoftonline.com` and the tenant's token and
  JWKS hosts. No inbound connection from Microsoft is required for the code
  flow. Front-channel logout is browser-initiated in an iframe, not a
  server-to-server call.
- If the network requires a proxy, confirm that Deno `fetch` honors the proxy
  environment for discovery, JWKS, and token requests. Do not disable TLS
  verification to make a proxy work. This is verification item V8.
- Reverse proxy access logs must redact the query string for
  `/auth/entra/callback`, or at least the `code` and `state` parameters.
  Prefer not logging query strings for auth paths at all.
- The app must be served over HTTPS in production. `APP_BASE_URL` must be the
  public HTTPS origin, including behind a TLS-terminating proxy.
- Multi-instance deployments need no sticky sessions: flows and sessions are in
  Postgres. Discovery and JWKS caches are per instance and rebuild on demand.
- The existing in-memory throttles are per instance. A multi-instance
  deployment already has this limitation for password login; SSO does not make
  it worse, but the flow cap is global because it is stored in Postgres.
- Backups must include `users`, `sessions`, and `auth_flows`. Restoring an old
  backup may resurrect expired sessions; lookups ignore expired rows, and the
  opportunistic sweep removes them.
- Do not run the app with a pre-SSO image while Entra users exist. Disable SSO
  and keep the schema instead.
- Log retention: define it at the deployment level. Auth logs should be kept
  long enough for incident review and no longer than the owner's policy allows.
- Monitoring: alert on repeated `auth.entra.callback.error`, discovery
  failures, flow capacity, certificate expiry within 30 days, and any 5xx from
  the auth routes. There is no metrics stack in the repo; use log-based alerts
  or the hosting platform's checks.

Break-glass procedure:

1. If Entra is unavailable, use a local admin account at `/login`.
2. If the local admin password is lost, run `deno task admin:create` on the host
   with a new email, or reset the password through the admin API from another
   local admin session.
3. If the app cannot start because SSO config is invalid, set
   `AUTH_SSO_ENABLED=false`, restart, and use local login. Do not delete the
   schema.
4. If an Entra user must be blocked immediately, deactivate the local user or
   call `DELETE /api/users/:id/sessions`, then disable the Entra account.
5. Record the incident and the actions taken. Do not paste secrets or tokens
   into the incident ticket.

Certificate and secret rotation:

- Certificate: generate a new key and certificate, upload the public
  certificate to the app registration, deploy the new files, verify a login,
  then remove the old certificate. Entra allows overlapping credentials.
- Secret: create a second client secret, deploy it, verify, then remove the
  first after the overlap window.
- Rotate on a schedule shorter than the credential lifetime and immediately on
  suspected exposure. The doctor warns at 30 days before certificate expiry.
- Keep the private key out of backups that are not encrypted and access
  controlled.

## Performance and lightweight footprint

Login path cost:

- Initiation: one Postgres insert, one random generation, one redirect. Target
  under 50 ms at p95 on the app side.
- Callback: one Postgres delete, one token request to Entra, one signature
  verification, one user lookup, one session insert, one redirect. Target under
  1 second at p95 when discovery and JWKS are warm, and under 3 seconds cold.
  Entra latency dominates.
- Dashboard requests: no change beyond two extra text columns in the existing
  session join. No per-request IdP call.
- Logout: one delete and an optional navigation to Entra. Local logout does not
  wait for Entra.

Resource limits:

- `auth_flows` rows are small and expire in 10 minutes. The cap is 10,000.
- No token cache, no refresh timer, no background worker, no new service.
- Discovery is cached for one hour per instance. JWKS caching is inside the
  library.
- The dependency adds under 1 MB unpacked. Measure the built server bundle and
  container image; do not assume the unpacked size equals the shipped size.
- Memory: measure startup RSS because the server bundle includes the library.
  Do not import it from the dashboard or the login island. Use a dynamic import
  only if measurement shows a real startup cost; do not complicate the first
  release without evidence.

Scalability:

- The design is stateless at the HTTP layer. Any instance can handle the
  callback because the flow is in Postgres.
- The flow consume is a single `DELETE ... RETURNING`, which is atomic under
  concurrent callbacks.
- The users unique index and the local-admin row locks keep identity and role
  invariants under concurrency.
- The global flow cap is a deliberate single point of failure under attack; it
  fails closed rather than letting the table grow without bound.

## Testing plan

Tests are layered so most security logic runs without a network or a real
tenant. Do not claim a test passed unless it was run.

### Pure unit tests

- `parseAuthConfig`: valid local-only, valid SSO with key, valid SSO with
  secret, missing tenant, missing client id, both credentials, neither
  credential, HTTP public base URL, base URL with path or query, invalid
  booleans, out-of-range TTL and tolerance, `AUTH_LOCAL_ENABLED=false`.
- `safeAuthNext`: empty, `/`, `//evil`, `https://evil`, `/\evil`, `%2f%2fevil`,
  `/auth/...`, `/api/...`, `/login`, control characters, over 2048 characters,
  valid path with query.
- Authorization URL: exactly one `state`, `nonce`, `code_challenge`, S256
  method, `response_mode=query`, `scope=openid profile`, no `offline_access`,
  no `login_hint`, `prompt` only when enabled.
- Claim policy: valid claims; wrong issuer; wrong audience; wrong `tid`;
  missing `oid`; non-GUID `oid`; missing `sub`; `ver=1.0`; wrong `nonce`; wrong
  `azp`; expired; future `iat`; missing `sid`.
- Error mapping: each provider error code maps to the allowed `sso` code and
  never reflects the description.
- Logout URL: correct tenant path, encoded post-logout URI, no token, no email.
- PEM parsing and thumbprint: valid certificate PEM, wrong label, empty body,
  oversized input.
- Constant-time comparison helper: equal and unequal inputs.

### Database integration tests

These self-skip with a visible message when `DATABASE_URL` is unset, following
the existing pattern.

- Insert a flow, consume it once, and confirm the second consume returns no row.
- Expired flow cannot be consumed.
- Binding mismatch consumes the flow and returns no session material.
- Concurrent consume of the same state returns exactly one row.
- Sweep deletes only expired rows.
- Capacity check returns the cap behavior.
- Create a local user and an Entra user; confirm the shape constraint rejects a
  local user with a null hash and an Entra user with a password.
- Duplicate `(tid, oid)` is rejected by the partial unique index.
- Session insert with `auth_method='entra'` and a sid hash; lookup returns the
  auth source and method.
- `deleteSessionsForUser` returns the count and removes only that user's rows.
- `deleteSessionsBySidHash` removes only matching rows.
- Convert a local user to Entra: id preserved, password null, oid set, sessions
  revoked.
- Last active local admin cannot be converted, demoted, deactivated, or
  deleted, including when another Entra admin exists.
- A second active local admin allows conversion of the first.
- OID correction revokes sessions and rejects a duplicate mapping.
- Password reset on an Entra user is rejected before hashing.

### Fake OIDC provider

Build a local test server with `Deno.serve` on `127.0.0.1` and a random port.
`deno task test` already allows network to `127.0.0.1` and `localhost`.

Endpoints:

- `/.well-known/openid-configuration`: issuer, authorization endpoint, token
  endpoint, JWKS URI, supported algorithms including RS256.
- `/jwks`: generated RSA public key in JWK form.
- `/token`: validates the code, PKCE verifier, redirect URI, and client
  assertion shape; returns a signed ID token.
- `/authorize`: optional, for a browser smoke test. It can redirect to the
  callback with a code and state.

Generate an RSA key pair with WebCrypto in the test. Sign tokens manually with
RSASSA-PKCS1-v1_5 and SHA-256. Do not add a test-only JWT dependency. Pass the
library's insecure-request option only for the `127.0.0.1` fake provider, never
in production code.

Scenarios:

- Success.
- Wrong issuer, audience, tenant, nonce, signature, and algorithm.
- Expired token and future `iat`.
- Missing `oid`, `sub`, or `ver`.
- Token endpoint 500 and timeout.
- JWKS unavailable.
- Authorization response with `error=access_denied`.
- Authorization response with an unexpected `iss`.
- Callback with an extra `session_state` parameter.

The fake provider must never be reachable from production code. It lives under
`test/` or a `*_test.ts` module that is excluded from the Docker build.

### Route and security-negative tests

- `/auth/entra/login` with SSO disabled returns 404.
- Login start sets the binding cookie and redirects with state, nonce, and PKCE.
- Already-authenticated start redirects without creating a flow.
- Callback success sets `barrier_session` and redirects to the stored path.
- Callback replay, expired flow, wrong binding, missing code, duplicated state,
  and oversized input all fail without a session.
- Callback with `error=access_denied` redirects to `?sso=denied` and clears the
  binding cookie.
- Unknown Entra identity and inactive user both return `?sso=no_access`.
- A valid Entra user with no local password cannot use `/api/auth/login`; the
  response is the same generic 401 and still pays the PBKDF2 cost.
- An Entra user cannot use `/api/auth/password`.
- An admin cannot reset an Entra user's password.
- A non-admin cannot call the revoke endpoint.
- An admin can revoke another user's sessions and gets the count.
- Self-revocation succeeds and invalidates the current cookie.
- The last local admin guard blocks conversion, demotion, deactivation, and
  deletion.
- The API never returns `entra_tid`, `idp_sid_hash`, or any token.
- Logs from a failed callback contain no code, state, token, oid, email, or
  full URL. Capture the logger output in the test.

### Browser and staging smoke

- Start the app with the fake provider or a real dev app registration.
- Click the Microsoft button, complete sign-in, land on the requested page.
- Confirm the session cookie is HttpOnly, Secure on HTTPS, and SameSite=Lax.
- Confirm logout deletes the local session and, for Entra, navigates to the
  end-session URL.
- Confirm the browser back button after logout does not restore a working
  session.
- Confirm the password form is hidden for an Entra user and the admin reset
  action is unavailable.
- Confirm a local admin can still sign in while SSO is enabled.
- Confirm a direct callback replay in a second tab fails gracefully.

Use the existing `scripts/browser-smoke.ts` or `deno task browser:capture` if it
can drive the flow without adding a dependency. Otherwise record a manual
checklist with screenshots that contain no real user data. Do not add a browser
automation dependency just for this plan.

### Verification commands

After code changes:

1. `deno task check`
2. `deno task test`
3. `deno task build`
4. `deno task doctor` against staging, with SSO enabled
5. Docker build and image size comparison
6. Manual browser smoke with the fake provider and with a real dev tenant

`deno task check` must include the new auth routes. `deno task test` must allow
the local fake provider. Route tests that read `AUTH_*` through `Deno.env` must
add those names to the test task's `--allow-env` list, or inject an `EnvGetter`
as the unit tests do; prefer injection. If a test cannot run because
`DATABASE_URL` is unset or a real tenant is unavailable, say so explicitly.

## Rollout and rollback

### Feature flag behavior

- `AUTH_SSO_ENABLED=false` is the default. The login page hides the Microsoft
  button and the auth routes return 404.
- Existing Entra sessions remain valid when the flag is turned off, by design.
  This avoids mass logout during a temporary IdP outage. If immediate
  revocation is required, use the admin revoke endpoint or the SQL runbook.
- Turning the flag off does not delete users, mappings, or sessions.
- Turning the flag on requires a valid config; otherwise the auth routes fail
  closed and the login page shows a notice while local login remains.
- `AUTH_LOCAL_ENABLED` is reserved but must remain true in phase 1. Disabling it
  is a separate ADR with its own break-glass analysis.

### Rollback matrix

| Phase                   | Rollback                                                   |
| ----------------------- | ---------------------------------------------------------- |
| 0, decisions and spike  | Discard the branch; no production change                   |
| 1, schema               | Keep the additive columns and table; old code ignores them |
| 2, config and OIDC core | Revert code; flag stays off                                |
| 3, routes and session   | Set flag off; routes return 404; existing sessions stay    |
| 4, login UI             | Set flag off; the button disappears                        |
| 5, admin UI             | Set flag off; admin actions reject Entra changes           |
| 6, docs and doctor      | Revert docs; no runtime impact                             |
| 7, staging              | Set flag off; local login remains                          |
| 8, production           | Set flag off; revoke Entra sessions if needed              |

Never deploy a pre-SSO image while Entra users exist. The old code assumes
`password_hash` is a string and can fail or behave unpredictably for SSO users.
Disable the flag and keep the new image instead.

### Communication

- Announce the change to pilot users with the tenant, the expected Microsoft
  sign-in screen, and the local fallback.
- Tell users that their dashboard password does not change until an admin
  converts their account.
- Tell admins how to provision by Object ID and how to revoke sessions.
- Publish the support path for "no access" and "expired flow" messages.
- Do not include real Object IDs or email addresses in screenshots or tickets.

## Implementation phases

Each phase is a separate change set with its own verification. Do not start the
next phase until the current acceptance criteria pass.

### Phase 0 - Decisions and spike

Tasks:

- Owner approves or rejects D13 and D14 and the decisions in the next section.
- Create a dev app registration and a test tenant user.
- Spike `openid-client` 6.8.8 on Deno: discovery, code exchange, ID token
  validation, private key JWT with PS256, `aud` override, `x5t#S256`, logout
  URL, and local fake provider.
- Record the results in this document or a short spike note. Do not append ADRs
  until approved.

Acceptance:

- A real dev login completes end to end.
- The token exchange uses the exact redirect URI and PKCE.
- The private key JWT is accepted by Entra, or the fallback is chosen with owner
  approval.
- The logout behavior is understood and documented.
- No production code or schema is changed.

Rollback: discard the spike branch.

### Phase 1 - Schema and SQL

Tasks:

- Add the columns, constraints, indexes, and `auth_flows` table.
- Add `lib/server/sql/auth-flows.ts`.
- Extend `lib/server/sql/users.ts` and `sessions.ts` with the new fields and
  helpers.
- Add the local-admin count and guard.
- Add database integration tests.

Acceptance:

- `deno task db:migrate` succeeds on a clean database and on a copy of a
  pre-existing database.
- `deno task check` passes, including the migration-order guard.
- Existing login, logout, password change, and admin user flows still pass.
- No behavior change when SSO is off.

Rollback: keep the additive schema; revert the code if needed.

### Phase 2 - Config and OIDC core

Tasks:

- Add `loadAuthConfig` and the Entra config module.
- Add key and certificate loading, thumbprint calculation, discovery cache, safe
  fetch, client authentication, claim policy, and error mapping.
- Add unit tests and the fake OIDC provider.
- Add `openid-client` to `deno.jsonc` and update the lockfile.

Acceptance:

- Config validation rejects every missing or contradictory combination.
- The fake provider covers success and the negative cases.
- No token, code, state, or claim appears in test logs.
- The module is not imported by any client-bundled file.

Rollback: revert the dependency and code; no schema change.

### Phase 3 - Auth routes and session

Tasks:

- Add login, callback, and logged-out routes.
- Add the binding cookie helper.
- Add the session creation path with `auth_method='entra'`.
- Modify logout to return `ssoLogoutUrl`.
- Add route tests and the replay, expiry, and binding tests.
- Add the auth routes to `deno task check`.

Acceptance:

- A real dev login creates a working local session.
- Replay, expiry, wrong binding, unknown user, and inactive user all fail
  closed.
- Existing password login and logout still pass.
- The callback sets `Cache-Control: no-store` and `Referrer-Policy:
  no-referrer`.

Rollback: set `AUTH_SSO_ENABLED=false`; routes return 404.

### Phase 4 - Login UI

Tasks:

- Extend `routes/login.tsx` and `islands/LoginForm.tsx`.
- Add the Microsoft button, local toggle, error mapping, and PT-BR copy.
- Keep the existing password form behavior and tests.

Acceptance:

- The button appears only when SSO is enabled.
- The local form appears only when local login is enabled.
- Error codes render the correct message and never reflect raw input.
- Keyboard and screen-reader behavior is acceptable.

Rollback: hide the button with the flag.

### Phase 5 - Admin provisioning and revocation

Tasks:

- Extend the users API and admin UI for Entra creation, conversion, oid
  correction, and session revocation.
- Hide password reset for Entra users.
- Hide the password form in `AccountSection` for Entra users.
- Add the last-local-admin guard to every mutation path.

Acceptance:

- An admin can create an Entra user by Object ID and that user can log in.
- A local user can be converted without losing the user id or history.
- The last active local admin cannot be removed by any path.
- Revoking sessions invalidates the target's cookies immediately.
- A non-admin cannot perform any of these actions.

Rollback: set the flag off; the API rejects Entra operations.

### Phase 6 - Operations and documentation

Tasks:

- Update `.env.example`, `readme.md`, `docs/ARCHITECTURE.md`, `docs/API.md`,
  `docs/DATABASE.md`, `docs/DEPLOY-WINDOWS.md`, and the dependency bulletins.
- Add doctor checks.
- Add the proxy redaction note and the NTP requirement.
- Add the secret mount to `compose.yml` and the ignore files.
- Add the certificate and secret rotation runbook.

Acceptance:

- A new operator can configure the feature from the docs alone.
- Doctor catches missing config, missing files, expired certificate, clock skew,
  and no local admin.
- No secret is printed by doctor or present in the image.

Rollback: revert docs and mount; no runtime impact.

### Phase 7 - Staging pilot

Tasks:

- Enable SSO in staging for a small Entra group.
- Run the browser smoke, the rollback drill, the revoke drill, and the
  break-glass drill.
- Measure login latency, error rate, and bundle size.
- Confirm the proxy logs redact the callback query string.

Acceptance:

- At least one local admin and several Entra users sign in successfully.
- A disabled Entra user and an unprovisioned user both fail closed.
- A certificate or secret rotation is rehearsed in staging.
- The rollback flag is tested.

Rollback: disable the flag; local login remains.

### Phase 8 - Production enablement

Tasks:

- Create the production app registration and credentials.
- Deploy the schema and code with the flag off.
- Run doctor against production.
- Enable the flag for the pilot group, then for everyone.
- Announce the change and the fallback.

Acceptance:

- Doctor passes.
- At least one local admin can still sign in.
- Entra users can sign in and sign out.
- Session revocation works.
- No auth errors in the logs beyond expected pilot failures.

Rollback: disable the flag; revoke Entra sessions if the incident requires it.

### Phase 9 - Optional later work

Each item needs its own decision and, where required, an ADR:

- Front-channel logout with `sid`, iframe headers, and a session-by-sid delete.
- Entra app roles or group-to-role mapping.
- SSO-only mode and disabling local login, with a new break-glass design.
- Just-in-time provisioning or SCIM, if the tenant requires it.
- A second identity provider.
- Shorter session TTL or idle timeout for Entra sessions.
- Seamless Entra logout with a stored `id_token_hint`, if the owner accepts the
  token storage risk.

## File impact map

Re-verify every path at implementation time. This map describes the expected
change, not a guarantee that the file is unchanged.

| File                                         | Change                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `db/schema.sql`                              | Add user auth columns, session auth columns, constraints, indexes, `auth_flows`                                 |
| `lib/server/sql/auth-flows.ts`               | New: insert, consume, sweep, capacity                                                                           |
| `lib/server/sql/users.ts`                    | `UserRow.password_hash` nullable; auth fields; Entra lookup; admin shape; create and convert; local-admin guard |
| `lib/server/sql/sessions.ts`                 | `auth_method`, `idp_sid_hash`, session create options, revoke by user and sid                                   |
| `lib/server/auth/session.ts`                 | Binding cookie helpers, or a new `lib/server/auth/entra/cookies.ts`                                             |
| `lib/server/auth/constant-time.ts`           | New: shared constant-time comparison, if not kept local                                                         |
| `lib/server/auth.ts`                         | No behavior change expected; confirm the session user type                                                      |
| `lib/server/page-auth.ts`                    | Map `auth_source` into `AuthUser`; add `safeAuthNext` or a shared module                                        |
| `lib/types.ts`                               | `AuthUser.authSource`                                                                                           |
| `lib/server/config.ts`                       | `loadAuthConfig`, env parsing, validation                                                                       |
| `lib/server/auth/entra/config.ts`            | New: issuer, redirect URIs, credential selection                                                                |
| `lib/server/auth/entra/client.ts`            | New: discovery cache, safe fetch, client auth, token exchange                                                   |
| `lib/server/auth/entra/flows.ts`             | New: state, nonce, PKCE, binding                                                                                |
| `lib/server/auth/entra/claims.ts`            | New: claim policy and identity extraction                                                                       |
| `lib/server/auth/entra/errors.ts`            | New: reason codes and public mapping                                                                            |
| `lib/server/auth/entra/logout.ts`            | New: end-session URL                                                                                            |
| `lib/server/auth/entra/keys.ts`              | New: PEM loading, import, thumbprint                                                                            |
| `routes/auth/entra/login.ts`                 | New                                                                                                             |
| `routes/auth/entra/callback.ts`              | New                                                                                                             |
| `routes/auth/entra/logged-out.ts`            | New                                                                                                             |
| `routes/auth/entra/frontchannel-logout.ts`   | New, phase 9 only                                                                                               |
| `routes/api/auth/login.ts`                   | Reject SSO users with the dummy hash path                                                                       |
| `routes/api/auth/password.ts`                | Reject SSO users before `verifyPassword`                                                                        |
| `routes/api/auth/logout.ts`                  | Return `ssoLogoutUrl`, resolve auth method before delete                                                        |
| `routes/api/auth/me.ts`                      | Return the public shape with `auth_source`; no oid                                                              |
| `routes/api/users.ts`                        | Create local or Entra user                                                                                      |
| `routes/api/users/[id].ts`                   | Convert, correct oid, reject password on Entra                                                                  |
| `routes/api/users/[id]/sessions.ts`          | New: revoke all sessions                                                                                        |
| `routes/login.tsx`                           | SSO props, error code, local toggle                                                                             |
| `islands/LoginForm.tsx`                      | Microsoft button, local form toggle, error messages                                                             |
| `components/settings/AccountSection.tsx`     | Hide password form for Entra                                                                                    |
| `components/settings/admin/UsersManager.tsx` | Auth badge, Entra create, convert, revoke                                                                       |
| `components/settings/AdminSection.tsx`       | Thread `ssoEnabled`                                                                                             |
| `components/SettingsPanel.tsx`               | Thread `ssoEnabled` if needed                                                                                   |
| `routes/index.tsx`                           | Pass `ssoEnabled` to settings if needed                                                                         |
| `scripts/doctor.ts`                          | SSO config, key, certificate, egress, clock, local admin checks                                                 |
| `scripts/create-admin.ts`                    | Confirm it still creates a local admin; no Entra flag                                                           |
| `deno.jsonc`                                 | `openid-client` import, auth route check glob                                                                   |
| `deno.lock`                                  | Regenerated by `deno install`                                                                                   |
| `.env.example`                               | New keys with comments and defaults                                                                             |
| `compose.yml`                                | `./secrets:/app/secrets:ro` on `app` only                                                                       |
| `.gitignore`, `.dockerignore`                | Ignore `secrets/`                                                                                               |
| `docs/ARCHITECTURE.md`                       | Auth flow, config, persistence, layer boundaries                                                                |
| `docs/API.md`                                | New routes, shapes, errors, throttle, permission matrix                                                         |
| `docs/DATABASE.md`                           | Auth schema, constraints, `auth_flows`, retention                                                               |
| `docs/DEPENDENCY-SECURITY-BULLETINS.md`      | `openid-client`, `jose`, `oauth4webapi`                                                                         |
| `docs/DEPLOY-WINDOWS.md`                     | Egress, proxy, NTP, certificate ACLs, log redaction                                                             |
| `readme.md`                                  | Feature list, env table, login behavior                                                                         |
| Test files                                   | Unit, DB integration, fake provider, route security                                                             |

Do not modify `DECISIONS.md` until the owner approves D13 and D14. When
approved, append them; do not rewrite D01 to D12.

## Owner decisions required

These are decisions, not implementation details. This plan recommends an option
for each, but the owner must choose. A "blocking" phase means the decision must
be recorded before that phase starts.

| ID  | Decision                                                                  | Recommendation                                 | Why                                                                                      | Blocking |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| O1  | Add Entra ID as a second sign-in method                                   | Approve, ADR D13                               | New sign-in method requires explicit approval                                            | Phase 0  |
| O2  | Adopt `openid-client` 6.8.8                                               | Approve, ADR D14                               | Avoid hand-rolled protocol and JWT validation                                            | Phase 0  |
| O3  | Client credential: certificate `private_key_jwt` or client secret         | Certificate, secret only as fallback           | No shared bearer secret in `.env`; Microsoft recommends certificate credentials          | Phase 0  |
| O4  | Keep local login and a local break-glass admin                            | Keep both                                      | Prevents a total lockout during an Entra outage or misconfiguration                      | Phase 0  |
| O5  | Provisioning: admin pre-provision by Object ID, no JIT, no email link     | Approve                                        | Prevents account takeover through email or UPN control                                   | Phase 0  |
| O6  | Roles: local authoritative, no Entra app roles yet                        | Approve                                        | Smallest secure change; group mapping is a separate design                               | Phase 0  |
| O7  | Logout UX: local logout plus best-effort Entra logout with account picker | Approve                                        | Avoids storing ID tokens just for `id_token_hint`                                        | Phase 0  |
| O8  | Session TTL for Entra users                                               | Same 12 h initially, review later              | Preserves the current contract; shorter TTL reduces leaver exposure but changes behavior | Phase 0  |
| O9  | Route namespace `/auth/entra/*`                                           | Approve                                        | Clear provider boundary; avoids `/api/auth` ambiguity                                    | Phase 0  |
| O10 | Allow an admin to correct an Entra Object ID after provisioning           | Allow with confirmation and session revocation | Typos and recreated accounts are real; the unique index prevents duplicates              | Phase 5  |
| O11 | Require Entra app assignment and Conditional Access for the pilot         | Yes, assignment plus MFA/device policy         | Adds a tenant-side gate; local `active` stays authoritative                              | Phase 7  |
| O12 | Privacy and international transfer sign-off                               | Owner and DPO review before production         | Entra identifiers and Microsoft processing are personal data                             | Phase 8  |
| O13 | Deployment egress, proxy, NTP, and log redaction                          | Owner provides evidence before staging         | These are environment prerequisites, not code                                            | Phase 7  |
| O14 | Front-channel logout, SSO-only mode, app roles                            | Defer to separate decisions                    | Each adds risk and needs its own break-glass analysis                                    | Phase 9  |
| O15 | `AUTH_LOCAL_ENABLED=false`                                                | Do not support in phase 1                      | It removes the break-glass path                                                          | Phase 0  |

## Verification and spike items

These are facts to confirm from the tenant, the library, or the deployment.
Do not treat a recommendation as verified. Record the result and the date.

| ID  | Question                                                                                                                                   | How to verify                                                                                        | Blocking         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------- |
| V1  | Is the "ID tokens" checkbox required for the authorization code flow to return an ID token?                                                | Create a dev app, request `openid profile` with and without the checkbox, inspect the token response | Phase 0          |
| V2  | Is `sid` present in the ID token by default, or must it be added as an optional claim?                                                     | Decode a dev ID token; check Token configuration                                                     | Phase 0, phase 9 |
| V3  | Must `post_logout_redirect_uri` be registered as a redirect URI?                                                                           | Try an unregistered and a registered value in the dev tenant                                         | Phase 0          |
| V4  | Does `openid-client` 6.8.8 sign the client assertion with PS256, set `aud` to the token endpoint, and include `x5t#S256` as Entra expects? | Inspect the assertion in a dev token request; decode the header and payload                          | Phase 0          |
| V5  | Does Entra accept `client_secret_post` for this app, or is `client_secret_basic` required?                                                 | Test both in the dev tenant with a throwaway secret                                                  | Phase 0          |
| V6  | Is `openid-client` fully Deno-compatible, including import, discovery, JWKS, and private key JWT?                                          | `deno check`, `deno task build`, a real dev login, and `deno task test`                              | Phase 0          |
| V7  | Does the library cache JWKS and handle Entra signing key rollover without a restart?                                                       | Rotate or simulate a key change in the fake provider; check the real tenant metadata                 | Phase 0, phase 2 |
| V8  | Does Deno `fetch` honor the deployment proxy for discovery, JWKS, and token requests?                                                      | Run doctor behind the proxy; inspect the egress logs                                                 | Phase 7          |
| V9  | Does the tenant allow `http://localhost:<port>/auth/entra/callback` as a Web redirect URI?                                                 | Add it to the dev app registration and complete a login                                              | Phase 0          |
| V10 | Does Entra end-session work without `id_token_hint`, and does it show an account picker?                                                   | Test logout in the dev tenant with and without the parameter                                         | Phase 0          |
| V11 | Are `azp`, `ver`, `auth_time`, and `sid` present, and does `prompt=select_account` behave as intended?                                     | Decode dev ID tokens and observe the sign-in screen                                                  | Phase 0          |
| V12 | Does the authorization response include `iss`, and does the library validate it without breaking redirect URI derivation?                  | Capture a dev callback; test with and without passing `iss`                                          | Phase 0          |
| V13 | What exact payload does Entra send to front-channel logout, and does the iframe send cookies?                                              | Register a test URL; inspect the request in a dev tenant                                             | Phase 9          |
| V14 | Does disabling SSO keep existing sessions valid, and does the revoke endpoint invalidate them immediately?                                 | Staging drill                                                                                        | Phase 7          |
| V15 | Can the key and certificate match be verified in doctor without a new dependency?                                                          | Try `node:crypto` `X509Certificate` on Deno; fall back to a reported skip                            | Phase 6          |
| V16 | Does the tenant require assignment, and does a blocked assignment return `access_denied`?                                                  | Assign and unassign a test user                                                                      | Phase 7          |
| V17 | Does `authorizationCodeGrant` accept the synthetic callback URL and derive the exact registered redirect URI?                              | Fake provider and real dev login; inspect the token request                                          | Phase 0          |
| V18 | Does the reverse proxy log query strings for the callback, and can it redact them?                                                         | Inspect proxy config and a test request                                                              | Phase 7          |
| V19 | What is the real certificate expiry and rotation window?                                                                                   | Read the certificate metadata in the portal; record the date                                         | Phase 7          |
| V20 | Does the production host have reliable NTP and outbound HTTPS?                                                                             | Check `timedatectl` or Windows time service and egress logs                                          | Phase 7          |

If a spike fails:

- Do not silently switch to a less secure option.
- Record the failure, the tested version, and the error class.
- Propose the smallest alternative, for example `client_secret_post` instead of
  private key JWT, and ask the owner to approve it.
- Do not hand-roll a replacement protocol stack in the same change.

## Draft ADRs (not appended)

Append these only after owner approval. The latest existing ADR is D12 at this
snapshot. Renumber if another ADR lands first.

### D13 - Microsoft Entra ID OIDC as a second sign-in method

Context: the dashboard currently supports only local email and password
authentication with opaque Postgres sessions. The owner wants corporate SSO
through Microsoft Entra ID without weakening the existing session model,
local role authority, or break-glass access.

Decision: add Entra ID as a second sign-in method using the authorization code
flow with PKCE (S256), `state`, `nonce`, an exact redirect URI, and
`response_mode=query`. Keep the existing opaque session cookie and Postgres
session store. Do not store IdP tokens. Map users by `(tid, oid)`. Provision
users by admin action only, with no just-in-time creation and no email
auto-link. Keep local roles authoritative and keep local password login plus at
least one active local administrator as the break-glass path.

Consequences:

- `users` gains `auth_source`, `entra_tid`, and `entra_oid`; `password_hash`
  becomes nullable with an exclusive shape constraint.
- `sessions` gains `auth_method` and an optional `idp_sid_hash`.
- A new `auth_flows` table stores short-lived state, binding, nonce, and PKCE
  verifier hashes.
- Login, callback, logout, admin provisioning, conversion, and session
  revocation change.
- Entra tokens, groups, app roles, SCIM, and front-channel logout are out of
  scope.
- Residual risk: a disabled Entra account keeps its local session until the
  TTL or an admin revocation.

Alternatives considered: SAML, implicit flow, JWT session tokens, JIT
provisioning, email auto-link, Entra app roles in phase 1, and local login
removal. Each was rejected for complexity, security, or lockout risk.

Verification: the spike items above, `deno task check`, `deno task test`,
`deno task build`, staging login and rollback drills.

### D14 - Adopt `openid-client` for OIDC

Context: the app needs OIDC discovery, authorization URL construction, code
exchange with PKCE, client authentication, JWKS handling, and ID token
validation. Hand-rolling these is security-sensitive and would duplicate a
certified implementation.

Decision: add `openid-client` 6.8.8 as a direct dependency, pinned exactly, with
`jose` and `oauth4webapi` as transitive dependencies. Use it only in
`lib/server/auth/entra/*`. Do not import it from client-bundled code.

Consequences:

- About 1 MB unpacked and a small runtime memory increase.
- New supply-chain surface, mitigated by the exact pin, lockfile, license
  review, and bulletin tracking.
- The app depends on the library's protocol behavior and release cadence.
- A future upgrade is a security-sensitive change with its own review.

Alternatives considered: hand-rolled `jose`, `jose` only, MSAL Node, and a
generic OAuth2 client. None matched the need for a small, certified,
provider-agnostic OIDC client with private key JWT support.

Verification: `deno install`, `deno task check`, `deno task build`, the fake
provider suite, a real dev login, and bundle and image size measurements.

## Risks and open questions

Risks:

- Entra configuration drift: redirect URI, tenant id, client id, certificate,
  or secret changes can break login. Mitigate with doctor checks and a change
  log.
- Certificate expiry: a silent expiry blocks all new SSO logins. Mitigate with
  a 30 day warning, a rotation runbook, and two owners.
- Account mapping errors: a wrong Object ID grants the wrong person access.
  Mitigate with a confirmation screen, admin-only visibility, audit logs, and
  the unique index.
- Leaver exposure: a local session can outlive an Entra disable by up to 12
  hours. Mitigate with revocation, a shorter TTL if approved, and front-channel
  logout later.
- Log leakage: callback URLs and library errors can contain codes or tokens.
  Mitigate with no-URL logging, error class only, and proxy redaction.
- Dependency or protocol regression: a library upgrade could change validation
  behavior. Mitigate with the fake provider and a real login in staging.
- Local admin lockout: the guard could block a legitimate conversion. Mitigate
  with a clear error and a documented "create another local admin first" step.
- Email collision: an Entra user may share an email with an existing local
  user. The admin must convert, not create a duplicate. The unique email
  constraint makes this explicit.
- SSO-only pressure: the business may ask to disable local login before a
  break-glass design exists. Treat that as a separate decision with a written
  risk acceptance.
- Legal uncertainty: the owner and DPO must confirm the LGPD basis and the
  Microsoft transfer mechanism. Engineering cannot approve that.

Open questions for the owner:

- Which tenant and app registration are production, and who are the two owners?
- Is the pilot group required, or is assignment open to the whole tenant from
  day one?
- Certificate or client secret for the first release?
- Is the 12 hour session TTL acceptable for Entra users?
- Is a Microsoft account picker on logout acceptable, or is seamless logout a
  hard requirement?
- Should an admin be able to correct an Object ID after provisioning?
- When, if ever, should local login be disabled?
- What is the log retention policy, and where are the logs stored?
- Does the deployment have outbound HTTPS, a proxy, and reliable NTP?
- Does the privacy notice already mention Microsoft as a processor, or does it
  need an update?
- Is front-channel logout required in the first year, or can it wait?

## References

Official Microsoft documentation:

- Authorization code flow:
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- OIDC protocol:
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
- ID token claims:
  https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
- ID tokens:
  https://learn.microsoft.com/en-us/entra/identity-platform/id-tokens
- Claims validation:
  https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation
- Signing key rollover:
  https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover
- Certificate credentials:
  https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials
- App registration security best practices:
  https://learn.microsoft.com/en-us/entra/identity-platform/security-best-practices-for-app-registration
- App roles:
  https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps
- Logout:
  https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout

Standards and library:

- RFC 9700, OAuth 2.0 Security Best Current Practice:
  https://www.rfc-editor.org/info/rfc9700
- `openid-client`:
  https://github.com/panva/openid-client
- `oauth4webapi`:
  https://github.com/panva/oauth4webapi
- `jose`:
  https://github.com/panva/jose

Repository references:

- `agents.md` (security, privacy, dependencies, ADRs, verification)
- `DECISIONS.md` (append-only; latest D12 at this snapshot)
- `docs/ARCHITECTURE.md` (auth, config, persistence, layer boundaries)
- `docs/API.md` (error envelope, throttle, permission matrix)
- `docs/DATABASE.md` (auth schema and migration behavior)
- `docs/DEPLOY-WINDOWS.md` (host deployment)
- `docs/DEPENDENCY-SECURITY-BULLETINS.md` (dependency inventory)

## Definition of done

The change is complete only when all of these are true:

- D13 and D14 are approved and appended to `DECISIONS.md`.
- The schema migrates cleanly on a copy of the existing production database.
- `deno task check` passes with the new auth routes included.
- `deno task test` passes with the fake provider and the DB integration suites
  either passing or visibly skipping.
- `deno task build` passes and the client bundle does not import server auth
  code.
- A real dev tenant login, logout, revoke, and rollback drill pass.
- The last active local admin cannot be removed by any path.
- An Entra user cannot use password login, password change, or admin password
  reset.
- No auth route or log line contains a token, code, state, claim, email, or
  Object ID.
- Doctor passes in staging with SSO enabled.
- The privacy notice and data inventory are updated, or the owner records why
  they are not.
- The rollback flag and the emergency session revocation SQL are documented and
  rehearsed.
- The owner has accepted the residual leaver-session risk and the logout
  behavior.
