# Decisions

Binding architecture decisions. IDs are stable and referenced as `DECISIONS.md#Dxx`; never renumbered. Retired decisions omitted; gaps intentional. Append new decisions; do not rewrite accepted ones. Compacted 2026-11-22.

## D01

Database indexes are additive only: add indexes for real query paths; never remove an index or feature to simplify.

## D20

Admin field ownership: PATCH records newly-different keys in `barriers.manual_fields` (no-change saves record nothing). Sync excludes owned fields; `releaseFields` returns them; the column migration is idempotent.

## D21

Station access is fail-closed: a non-admin with no access group sees zero stations; `null` scope is admin-only. User creation accepts `accessGroupIds` for atomic scoping.

## D22

Production configuration is strict: `PUBLIC_API_MODE` must be known; production refuses mock mode; boot validates config. `/api/ready` is the DB-aware readiness probe; `/api/health` stays liveness-only.

## D23

Effective availability lives once in SQL (`effective_availability_id`) and drives filters, KPI, chart, vocabularies, contingencies, and stale alerts; the compliance trigger mirrors it. Dedup keys include the history row id.

## D24

Barrier PATCH is one transaction covering status, metadata, and contingency overlay. Sync ownership is enforced inside the UPDATE against current `manual_fields`, closing the long-sweep edit race.

## D25

Local SMTP is removed; delivery is the alert provider's job. Fonts are self-hosted under `static/fonts` (OFL). The old sync module is split into write, apply, and read. The UI is typechecked by `deno task check`.

## D26

Database credentials are reported by identity: `doctor` prints `user@host:port/db` and fails when a process-level `DATABASE_URL` overrides `.env`; the pool logs one config line; Windows setup syncs an existing role.

## D27

Station aliases: a folded collector label maps to SM8; a folded `/^3-co-[0-9]+-es$/` well-cluster code maps to CO with a null name, so the UI falls back to the code. The parser scans segments from L3; a transformer segment containing CO but not matching the well pattern stays under its L3 station; SM-1 stays under SM. Catalog rows are upserted.

## D28

Mobile test unit splits into CJ-UTM-N and CJ-UTM-C. The ambiguous folded L3 label is resolved by the L2 area, whose two known values map deterministically to CJ-UTM-C and CJ-UTM-N (both "Unidade Movel"); other areas keep the L3 parse. `db/schema.sql` renames the former single row to CJ-UTM-N in place (guarded, idempotent) so barriers and access groups keep their id, and adds the second code. Run `deno task db:migrate` before the next sync.

## D29

Email-based first Entra bind: a pending row (`auth_source = 'entra'`, null `entra_oid`, active) binds on the first valid token whose address claim matches, via `getPendingEntraUserByEmail` and `bindEntraIdentity` with an `entra_oid is null` lock and a unique index on `(entra_tid, entra_oid)`. Later sign-ins match by object id only; unknown addresses are denied; there is no JIT creation; local accounts are never matched.

## D30

Plaintext temporary password is a narrow exception: admin create and reset return `temporaryPassword` once, and the messaging notice carries it once for handover. It is never stored in clear in Postgres and never logged; provider echo bodies are read only for envelope errors and the password is scrubbed. It has no expiry because the system cannot enforce one; the forced-change gate limits use. The provider dedupes by account and kind, so a repeated notice may not send; the admin screen still shows it once.

## D31

Forced-change gate: a pending local session stays authenticated but held. Guarded reads and writes answer `403 PASSWORD_CHANGE_REQUIRED`, and `GET /` redirects to `/trocar-senha` so the client shows the form. Exemptions are narrow: `POST /api/auth/password`, `POST /api/auth/logout`, `GET /api/auth/me`, `ADMIN_TOKEN`, and the change page. Entra accounts never carry the flag.

## D32

Shared-password backfill and per-person import. `scripts/import-users.ts` draws a distinct password per new user with `generateTemporaryPassword()`, hashes per user, sets the forced-change flag, and writes `email<TAB>password` to a 0600 file in `scripts/fixtures/` (path and count only on stdout); existing users keep their password. The one-time backfill reads the legacy secret only from `LEGACY_SHARED_PASSWORD` or `--password`, dry-runs by default, checks only local active unflagged rows, prints counts only, and sets the flag on `--apply`. Both paths are idempotent.

## D33

Settings is a centered workspace, not a slide-over: a blurred backdrop frames a floating dialog about 1180px wide and 88dvh tall, with a fixed page rail and a content column that owns its scroll; it collapses to one column on small screens without horizontal scroll. Admin managers stay one lazy chunk with the fail-closed admin gate. Shared primitives are `SearchMultiSelect`, `AdminFormDialog`, `useAdminList`, and `AdminListControls`.

## D34

Batch-endpoint pattern: one admin-only POST per resource (`/api/users/batch`, `/api/access-groups/batch`, `/api/recipients/batch`, `/api/alert-rules/batch`) instead of N single-row requests; field options reuse `PUT /api/field-options?field=...` with the remaining array. Each batch runs in one transaction, validates a documented maximum id count (500 users, recipients, rules; 200 groups with 500 related ids and a 20,000 cross-product cap), preserves last-active-admin and last-active-local-admin guards, revokes sessions on user active-state changes, and returns `{ affected }`. The UI sends one request per action.

## D35

Batch endpoints use typed validation errors: expected input and domain rejections in user, recipient, access-group, and alert-rule helpers throw `ValidationError`, mapped to 400 with the message; every other error maps to 500 via the `INTERNAL` envelope, so database text never reaches the client. Users and alert-rule batches fail when any target id is missing; access-group related ids are checked before insert. Id validation uses `Number.isSafeInteger`; alias exports and action aliases are removed.

## D36

The details "Causa da Disponibilidade" section derives the cause at read time from `barrier_status_history.note` and `barriers.comments` instead of persisting raw work-order rows or adding API fields. Sync and import already write the decisive event with its reference, classification, detail, contingency signal, author, and participants, so reuse minimizes stored personal data and avoids schema, migration, and wire changes; consumers stay read-only. Limitation: only the decisive event is stored, so competing work orders cannot be reconstructed. The rule text mirrors `docs/STATUSES.md`; unknown statuses keep a deterministic fallback.
