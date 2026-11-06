# Changelog

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
