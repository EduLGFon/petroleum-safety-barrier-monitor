# Architecture - Safety Barrier Monitor

Deno-only Fresh 2 + Vite + Preact islands. No ORM, no `package.json`.

## Runtime

`main.ts` boots one `App<State>` with `staticFiles()` and `fsRoutes()`. `client.ts` imports styles for HMR. Vite uses `@fresh/plugin-vite`.

Key tasks: `check`, `test`, `dev`, `build`, `preview`, `start`, `db:migrate`, `db:seed`, `fracttal:*`, `alerts:*`, `admin:create`, `docker:*`.

`COMPANY_NAME` is read per request. `_app.tsx` renders the shell and restores theme/accent/density/font size/motion from `barrier-settings`.

## Layers

- `routes/`: SSR and HTTP edge. No dashboard UI.
- `lib/`: pure shared logic. No Preact or localStorage.
- `islands/`: hydrated JS only. `Dashboard.tsx` is the single root.
- `components/`: presentational.
- `hooks/dashboard/`, `useDashboard.ts`, `useConnection.ts`: client state.
- `context/`: settings and theme context.
- `lib/server/`: server-only Postgres, SQL, auth, exports, sync, alerts.

## Boundaries

- Dependency direction: mock mode uses in-memory data; HTTP mode uses `/api/*`.
- `lib/server/*` is never imported by islands, components, hooks or context.
- Status writes go only through `record_status_change()`, inside the same transaction as metadata edits.
- Filtering and sorting are centralized in `lib/server/sql/where.ts`; effective availability lives in the `effective_availability_id()` SQL function.
- Non-admin users with no access group have zero station access (fail closed).
- Exports stream from the database in batches.
- Admin field ownership: `barriers.manual_fields` records per-barrier columns
  an admin took over in the editor; the Fracttal sync skips those columns and
  `releaseFields` returns them to the sync.

## Auth

- Local password login is the break-glass path. Microsoft Entra ID is an
  optional second sign-in behind `AUTH_SSO_ENABLED`. See `docs/SSO-ENTRA-PLAN.md`.
- Entra accounts are pre-provisioned by an admin (no JIT). The first valid
  Entra sign-in binds by email to the pending `auth_source = 'entra'` row
  with a null `entra_oid`; later sign-ins match by `(entra_tid, entra_oid)`.
  Local roles stay authoritative; Entra groups are not mapped. See D29.
- New local accounts get a per-person password from
  `generateTemporaryPassword()` with `must_change_password = true`. The
  forced-change gate holds the session at the door: every data read and write
  answers `403 PASSWORD_CHANGE_REQUIRED` until the person sets a password of
  their own at `/trocar-senha`. Token auth (`ADMIN_TOKEN`),
  `POST /api/auth/password`, `POST /api/auth/logout`, and
  `GET /api/auth/me` are exempt; `GET /` redirects pending local
  sessions to `/trocar-senha`. Entra accounts never carry the flag. See D30
  and D31.
- Account notices reuse the alert provider (`ALERT_PROVIDER_*` carries both
  barrier alerts and account messages) plus `APP_BASE_URL` as the login-link
  base. The temporary password appears in exactly two server responses:
  once in the admin create/reset JSON (`temporaryPassword` with an `aviso`
  delivery report) and once in the MSGFLOW payload (`senha`). The one-time
  copies outside Postgres are the 0600 import handover file (D32) and the
  admin browser holding the one-time response. It is
  never stored in clear in Postgres, never logged, and the provider body
  is read only to extract the envelope `erro`/`mensagem`, with the password
  scrubbed and the raw body never returned or logged. It has no expiry in
  this release (`validade_horas` is omitted on
  purpose); the forced-change gate is what limits its use. See D30.
- MSGFLOW dedupes by account and kind (`conta_id` is the monitor user id). A
  repeated `senha_reset` for the same account may not send a second message;
  the new password is still shown once on the admin screen, which is the path
  that always works. `convite` carries a per-run `ocorrido_em` mark instead,
  so a new run resends on purpose. See D30.

## Data

Postgres holds lookups, barriers, contingency links, status history, users, sessions, auth flows, access groups, alert rules/events/recipients, sync state and field options. Location and category ids are dynamic vocabularies served by the server. Soft deletes use `deleted_at`. Contingency links are local and independent of sync.

See `docs/API.md` and `docs/DATABASE.md`.
