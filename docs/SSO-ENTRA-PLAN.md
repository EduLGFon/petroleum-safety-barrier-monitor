# SSO with Microsoft Entra ID - current status

Optional second sign-in method using OpenID Connect. Local password login remains the break-glass path.

## Status

Implemented behind `AUTH_SSO_ENABLED=false`. Uses the authorization code flow with PKCE (S256), `state`, `nonce`, exact redirect URI, and `response_mode=query`.

## Behavior

- Entra users are pre-provisioned by tenant ID + object ID; no JIT creation and no email auto-link.
- Local roles stay authoritative; Entra groups/roles are not mapped.
- IdP tokens are used only inside the callback and then discarded; no access, refresh, or ID token is stored.
- The app keeps the opaque Postgres session and `barrier_session` cookie.
- Logout can also end the provider session when front-channel logout is enabled.
- Converting a local account to Entra preserves its id and history.

## Routes

- `GET /auth/entra/login`
- `GET /auth/entra/callback`
- `GET /auth/entra/frontchannel-logout`
- `GET /auth/entra/logged-out`

## Configuration

See `.env.example` (`AUTH_SSO_*`, `AUTH_ENTRA_*`). Requires app base URL and callback registration in Entra.

## Data

Short-lived authorization flows are stored in Postgres keyed by a SHA-256 hash of `state`, with a browser-binding cookie. Users may be local or Entra; Entra accounts have a nullable password hash.
