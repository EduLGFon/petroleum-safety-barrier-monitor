# Changelog

## 2026-11-09

- Barrier details: new "Causa da Disponibilidade" section explains the current
  status and shows the decisive OS/SS from the persisted history, including
  reference, classification, detail, contingency signal, and people.

## 2026-11-07

- Settings: centered workspace now covers admin paging, bulk selection, and
  batch actions for users, groups, recipients, alert rules, and field
  options.
- Settings: new sync page inside the workspace reusing the sync changes list
  and last-run metadata; header greeting switched to `Olá, {name}`.
- API: additive admin-only batch routes `POST /api/users/batch`,
  `POST /api/access-groups/batch`, `POST /api/recipients/batch`,
  `POST /api/alert-rules/batch`, and bulk use of
  `PUT /api/field-options?field=...`.
- Docs: architecture, API, decisions, and README updated for the settings
  batch work (D34, D35); batch validation now returns typed 400s and hides
  database errors.

## 2026-11-06

- Auth: Entra pre-provisioning with email bind on first sign-in and no JIT
  creation. Local roles stay authoritative.
- Auth: per-person temporary passwords with a once-only admin response and
  MSGFLOW account notice, no expiry in this release, limited by the
  forced-change gate (`403 PASSWORD_CHANGE_REQUIRED`, `/trocar-senha`).
  MSGFLOW dedupes by account and kind, so a repeated `senha_reset` may not
  resend; the admin screen still shows the password once.
- Auth: shared-password backfill (`scripts/flag-shared-password-users.ts`,
  dry-run default, counts only) and per-person import
  (`scripts/import-users.ts` with a 0600 credentials file, existing users
  keep passwords).
