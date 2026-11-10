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

## Admin settings workspace

The settings side panel is a floating, screen-centered workspace modal: about
1180px wide, 88dvh tall, blurred backdrop, a fixed vertical page rail, and a
right content column with its own vertical scroll. It collapses to one column
on small screens and never scrolls horizontally. Navigation groups are
Preferências (Aparência, Filtros), Conta, Administração (Usuários, Grupos,
Destinatários, Regras, Opções), and Sistema (Sincronização). The admin
managers stay one lazy chunk and keep the fail-closed admin gate
(`sessionUser.role === "admin"`).

Shared primitives used by the admin pages:

- `components/settings/SearchMultiSelect.tsx`: portalled searchable chips field
  with select-all/clear and keyboard support (z-index 1300).
- `components/settings/admin/AdminFormDialog.tsx`: portalled sticky-header
  create/edit shell (z-index 1250).
- `components/settings/admin/AdminListControls.tsx`: `AdminSearchInput`,
  `AdminSelectionBar`, `AdminBulkButton`.
- `hooks/useAdminList.ts`: client-side search, 25/50/100 paging, page and
  select-all/clear selection, selection pruning. Pure helpers:
  `filterByQuery`, `pageSlice`, `toggleKey`, `pruneKeys`.
- `components/table/Pagination.tsx`: reused pager.
- Workspace CSS classes live in `static/styles.css`.

Header identity shows `Olá, {name}`, falling back to the email local part
and then `Usuário` (the email stays in `title`). Both roles share the standard
fade-in and hover lift, and admins only differ by the `Admin` role label.
Reduced motion and `html.no-anim` suppress the animation across all themes.

## Paging

Admin lists use `useAdminList` with page sizes 25/50/100 and client-side
search over the loaded rows. Selection is pruned when rows disappear after a
reload, and search resets to page one with an empty selection. The barrier
table keeps its own server paging and the `TableStatusRow` select-page /
select-all-across-filters controls.

## Batch endpoints

Bulk admin actions use one admin-only POST per resource instead of N
single-row requests. Expected validation and guard failures return 400 with
the standard `BAD_REQUEST` envelope; unexpected failures return 500 through
the `INTERNAL` envelope and never include database text (see D35). Each batch
validates ids, actions, and caps before touching rows:

- `POST /api/users/batch`: `{ action, ids }`, max 500 unique positive
  safe-integer ids. Actions are canonical only: `activate`, `deactivate`,
  `promote`, `demote`, `revokeSessions`. A missing id returns 400
  (all-or-nothing). Runs in one transaction, locks active admins, preserves the
  last active admin and last active local admin guards, revokes sessions on
  active-state changes, and `affected` counts rows actually changed while
  `revokeSessions` counts deleted session rows. The UI redirects to `/login`
  when the current user is in a deactivate or revoke set.
- `POST /api/access-groups/batch`: `{ action, ids, userIds | locationIds }`
  only, max 200 group ids and 500 related ids, cross product capped at 20,000.
  Actions are canonical only: `delete`, `addUsers`, `removeUsers`,
  `addLocations`, `removeLocations`. Uses `withTx`; cascade deletes; missing
  groups return 400. `addUsers` and `addLocations` verify every related user or
  location inside the same transaction, so unknown ids return 400 instead of a
  foreign-key 500. Returns `{ affected }`.
- `POST /api/recipients/batch`: `{ action, ids?, userIds? }`, max 500 unique
  positive safe-integer ids, deduped before the cap. Actions: `activate`,
  `deactivate`, `delete`, `addUsers`. `addUsers` inserts from `users` with
  `on conflict (email) do update set ..., active = true`. Returns
  `{ affected }`.
- `POST /api/alert-rules/batch`: `{ action, ids }`, max 500 unique
  safe-integer ids, deduped before the cap, atomic, all-or-nothing. Actions:
  `activate`, `deactivate`, `delete`. A missing id returns 400 and `affected`
  counts rows actually changed.
- Field options keep the existing `PUT /api/field-options?field=...` with the
  remaining array for bulk removal, plus add-option and restore-defaults.
  Saves stay serialized through the existing queue.

## Sync page

Synchronization history lives as the "Sincronização" page inside the settings
workspace instead of a modal. `SyncSection` reuses `SyncChangesList`, the
same last-run metadata, the technical note, and the "Última sync" /
"Últimas 24h" tabs. `DashboardSections` owns the single
`useConnection(healthUrl)` heartbeat (health URL derived from `apiBaseUrl`)
and passes `conn` to `Header` and `DashboardOverlays`; `DashboardChrome`
forwards it to `SettingsPanel`, so the sync page health label follows the
live connection instead of a hard-coded default. `SettingsPanel` accepts
optional `syncStatus`, `conn`, `apiBaseUrl`, and `onOpenBarrier` props.
`DashboardSections` tracks the landing section; the hover-card shortcut opens
settings on `sync`, and opening a barrier from sync rows closes settings
first. Sync history is no longer a separate modal.
