# Handoff - settings workspace redesign

Date: 2026-11-07. Work stopped because the owner's home network failed. No
feature-code work was lost: all feature worktrees are clean and unchanged from
the foundation merge.

## What is already done

### Task 1 - settings shell: merged on master

- `15e0650 merge: centered settings workspace foundation`
- `d949b07 feat(settings): add centered workspace shell and admin primitives`
- `b8d0d0c fix(settings): anchor picker on inner scroll and clamp pages`

The settings side panel is now a floating, screen-centered workspace modal:
1180px wide, 88dvh tall, blurred backdrop, fixed vertical page rail, and a
right content column with its own vertical scroll. The nav has Preferências
(Aparência, Filtros), Conta, Administração (Usuários, Grupos, Destinatários,
Regras, Opções), and Sistema (Sincronização). The admin managers remain one
lazy chunk and keep the fail-closed admin gate. See DECISIONS.md D33.

New shared primitives available on master:

- `components/settings/SearchMultiSelect.tsx`
  - `SearchOption<K>`, `SearchMultiSelect<K>`
  - portalled searchable chips field, select-all/clear, keyboard support,
    z-index 1300.
- `components/settings/admin/AdminFormDialog.tsx`
  - `AdminFormDialog` portalled sticky-header create/edit shell, z-index 1250.
- `components/settings/admin/AdminListControls.tsx`
  - `AdminSearchInput`, `AdminSelectionBar`, `AdminBulkButton`.
- `hooks/useAdminList.ts`
  - `useAdminList<T, K>({ items, getId, getSearchText, initialPageSize })`,
    client-side search, 25/50/100 paging, page/select-all/clear selection,
    selection pruning. Pure helpers `filterByQuery`, `pageSlice`, `toggleKey`,
    `pruneKeys`.
- Reuse `components/table/Pagination.tsx` as the pager.
- CSS classes for the workspace are in `static/styles.css`.

Verification on the foundation worktree: `deno task check`, `deno task test`
(678 passed, 0 failed), `deno task build` all exit 0. The fast test runner is
already on master from the parallel/deduped test work.

### Task 5 - single port 8300: implemented, not merged

- Worktree: `/home/edubot/.local/share/opencode/worktree/13047a/ports-8300`
- Branch: `worktree/ports-8300`
- Commit: `66666cb chore(dev): standardize dev and prod HTTP port on 8300`
- Files: `vite.config.ts`, `compose.dev.yml`, `docs/PORT-MAP.md`, `readme.md`,
  `scripts/browser-smoke.ts`, `scripts/browser-capture.ts`.
- Verified locally: `deno task check`, `deno task test` (672 passed),
  `deno task build` all exit 0 on its base commit.
- It is based on `7a06fce`, so it must be rebased onto current master before
  review and merge. It was never merged because review had not been run.

### Task 2 - searchable multi-selection: foundation only

`SearchMultiSelect` exists and is reviewed. It is not yet wired into the admin
pages. `components/settings/FiltersSection.tsx` already uses the dashboard
`MultiCombo`; leave that behavior unless a later change is explicitly scoped.

## Current worktrees

All feature worktrees were created from master `15e0650`, then the network
failed before any worker produced code. They are clean at `15e0650`:

- `/home/edubot/.local/share/opencode/worktree/13047a/admin-users`
  branch `worktree/admin-users`
- `/home/edubot/.local/share/opencode/worktree/13047a/admin-groups`
  branch `worktree/admin-groups`
- `/home/edubot/.local/share/opencode/worktree/13047a/admin-recipients`
  branch `worktree/admin-recipients`
- `/home/edubot/.local/share/opencode/worktree/13047a/admin-rules`
  branch `worktree/admin-rules`
- `/home/edubot/.local/share/opencode/worktree/13047a/admin-options`
  branch `worktree/admin-options`
- `/home/edubot/.local/share/opencode/worktree/13047a/header-sync`
  branch `worktree/header-sync`
- Foundation worktree: `settings-foundation` at `b8d0d0c`, already merged.
  Remove it with `git worktree remove ...` only after confirming the branch is
  merged and no one is using it.
- Ports worktree: `ports-8300` at `66666cb`, unmerged.

Master has no uncommitted changes. `git worktree list` showed only these
worktrees at handoff time. Re-check shared state before acting because another
orchestrator may be active.

## Remaining user tasks

Original request, tasks 1-8:

1. Centered floating settings modal with vertical pages. DONE on master.
2. Replace hard option lists with searchable multi-selection menus. Shared
   component DONE; admin pages NOT wired.
3. Bulk selection and bulk operations per settings page, with one batch request
   per action. NOT implemented.
4. Redesign creation menus (user, group, rule, recipient); Microsoft Entra as
   the default new-user type with local still available. NOT implemented.
5. Dev and prod builds on port 8300. Implemented on branch, UNMERGED.
6. Paging for every settings list, exactly like the barrier table, including
   select-page-or-select-all. NOT implemented.
7. Sync change details as a settings page, keeping the sync hover-card
   shortcut. NOT implemented.
8. Header greeting "Olá, {Nome}" replacing the email, with special admin
   effects and common non-admin effects. NOT implemented.

## Required work per unit

Use one worker and one worktree per unit. Do not edit product files from the
orchestrator. Each worker must read `agents.md` first, use the worktree as the
working directory for every shell call, never push, and never read `.env`.
Run `deno task check`, `deno task test`, `deno task build` in the worktree and
commit one atomic Conventional Commit. Then inspect the diff, run the gates
again yourself, and send the worktree to a reviewer of a different model
family before merging.

### A. Users page (`admin-users`)

Files: `components/settings/admin/UsersManager.tsx`,
new `UserFormDialog.tsx`, `UsersManager_test.ts`, new
`routes/api/users/batch.ts`, and bulk helpers at the end of
`lib/server/sql/users.ts` plus a pure test. Do not modify `routes/api/users.ts`
or `[id].ts`.

Implement `useAdminList` paging 25/50/100, search by email/name/role/source/
status, role/status/auth-source filters, row checkboxes, `AdminSelectionBar`,
and bulk Ativar/Desativar/Promover/Rebaixar/Revogar sessões. One
`POST /api/users/batch` per action with `{ action, ids }`. Preserve all
single-row actions and one-time temporary-password behavior. Confirm
deactivate/demote/revoke; redirect to `/login` if the current user is in the
affected deactivate/revoke set.

Create/edit uses `AdminFormDialog`. New user defaults to Microsoft Entra,
local password remains a second option. Fields: email, name, phone, role,
access groups via `SearchMultiSelect` from `/api/access-groups`, optional Entra
object id, optional local password. Send `accessGroupIds` for non-admin. Show
the one-time temporary password and notice inside the dialog.

Batch SQL must be one transaction, lock active admins, preserve the last active
admin and last active local admin guards, revoke sessions on active-state
changes, and return `{ affected }`. Validate max 500 unique positive ids.

### B. Groups page (`admin-groups`)

Fix the slow load by replacing the 1 + 2N query pattern in
`lib/server/sql/access-groups.ts:listAccessGroups` with three queries: groups,
all group locations, all group members; map in memory and preserve order.

Files: `GroupsManager.tsx`, new `GroupFormDialog.tsx`, optional
`GroupBulkDialog.tsx`, new `routes/api/access-groups/batch.ts`,
`lib/server/sql/access-groups.ts`, pure batch tests.

Use paging/search/selection/bulk. Create/edit dialog with name, description,
station `SearchMultiSelect` from `/api/lookups`, user `SearchMultiSelect` from
`/api/users`. Bulk actions: Excluir grupos, Adicionar/Remover usuários,
Adicionar/Remover estações. One `POST /api/access-groups/batch` per action.
Validate max 200 group ids and 500 related ids; reject a cross product over
20,000. Use `withTx`; cascade deletes; missing groups 400; return
`{ affected }`.

### C. Recipients page (`admin-recipients`)

Files: `RecipientsManager.tsx`, new `RecipientFormDialog.tsx`, new
`routes/api/recipients/batch.ts`, `lib/server/sql/recipients.ts`, pure tests.

Use paging 25/50/100, search email/name/phone, selection, bulk
Ativar/Desativar/Remover/Adicionar usuários. One
`POST /api/recipients/batch` with
`{ action: "activate"|"deactivate"|"delete"|"addUsers", ids?, userIds? }`.
`addUsers` inserts from `users` with `on conflict (email) do update set ...,
active = true`. Validate max 500 ids. Return `{ affected }`.

Creation dialog tabs: "Usuários" default (searchable multi-select of users not
already recipients, batch add) and "Manual" (email, name, phone). Keep the
critical-only phone label.

### D. Rules page (`admin-rules`)

Files: `RulesManager.tsx`, `RuleEditorModal.tsx`, `RuleEditorTabs.tsx`,
`rules-helpers.tsx`, new `routes/api/alert-rules/batch.ts`,
`lib/server/sql/alert_rules.ts`, pure tests.

Use paging/search/filter/selection/bulk Ativar/Desativar/Excluir. One
`POST /api/alert-rules/batch` with `{ action, ids }`, max 500 ids, atomic.
Replace every `CheckGrid` with `SearchMultiSelect` for categories, statuses,
source statuses, locations, criticalities, typologies, groupings, owners.
Keep empty = all. Rebuild the editor on `AdminFormDialog` with the existing
Básico/Escopo/Anti-ruído tabs, preview, numeric validation, and sticky footer.

### E. Field options page (`admin-options`)

File only: `FieldOptionsManager.tsx`. Add search over the current field's
options, paging 25/50/100, selection, and bulk "Remover selecionadas" using
ONE existing `PUT /api/field-options?field=...` with the remaining array.
Keep the serialized save queue, restore-defaults, add-option, and empty states.

### F. Header and sync page (`header-sync`)

Files: `Header.tsx`, `SyncHoverCard.tsx` if needed, delete
`SyncDetailsModal.tsx`, new `components/settings/SyncSection.tsx`,
`components/SettingsPanel.tsx`, `islands/dashboard/DashboardChrome.tsx`,
`islands/dashboard/DashboardSections.tsx`, `static/styles.css`, and a small
pure greeting helper plus test.

Header: replace the visible email with `Olá, {name || "Usuário"}` (keep email
in `title`), keep an accessible logout button and the gear. Admin gets a
restrained animated gradient/halo/shimmer and crown/sparkle; non-admin gets a
standard fade/hover/pulse. Respect reduced motion and all themes.

Sync: new settings page using `SyncChangesList`, the same last-run metadata,
technical note, and Última sync/Últimas 24h tabs. Add optional
`syncStatus`/`conn`/`apiBaseUrl`/`onOpenBarrier` props to `SettingsPanel`;
replace the sync placeholder. `DashboardSections` tracks the landing section;
the hover-card shortcut opens settings on `sync`; opening a barrier from sync
rows closes settings first. Remove the old modal and its lazy import.

## Verification and merge protocol

- Rebase each worktree onto current `master` before running the final tests.
  Master already contains the fast parallel test runner from `7a06fce`.
- Required gates in every worktree: `deno task check` (this currently runs
  `deno fmt` in write mode, so inspect `git status` after), `deno task test`,
  and `deno task build`.
- Review each worktree read-only with a model from a different family. Treat
  any major finding or failing gate as a failed attempt. Resume the same
  worker session for fixes; one model change at a time.
- Merge reviewed, passing units with `git merge --no-ff <branch>`. Do not
  merge a unit that touched auth, schema, or a public contract without owner
  sign-off. The batch routes are additive and admin-only; keep them that way.
- After all units: update `docs/ARCHITECTURE.md` (admin UI shell, paging,
  batch endpoints, sync page), `docs/API.md` (batch routes), `CHANGELOG.md`,
  and README feature line. Run a final `deno task check`, `deno task test`,
  `deno task build` on master. Check `git status` and `git worktree list`
  before cleanup.
- Remove merged worktrees with `git worktree remove <path>` only after their
  branch is merged and no process is using them. Never force-remove a
  worktree with uncommitted work.

## Prompt for the next AI model

Read this file first. Then re-check shared state:

```bash
git rev-parse --show-toplevel
git status --porcelain
git worktree list
git log --oneline -8
```

Resume the work as an orchestrator. Do not repeat the merged foundation. First
rebase and review `worktree/ports-8300`; merge it if the reviewer passes and
the gates are green. Then run the five admin-page units and the header/sync
unit in parallel on their existing clean worktrees, using the briefs above.
Use cheap models first and escalate only on failed evidence. Keep the shared
`SearchMultiSelect`, `AdminFormDialog`, `AdminListControls`, and
`useAdminList` contract stable; if a shared primitive needs a fix, do it in a
separate small unit, review it, merge it, and rebase the downstream worktrees.
Do not edit product files from the orchestrator. Do not push. Do not read
`.env` or secrets. Before merging any unit, re-check that other orchestrators
have not moved master, rebase the unit, rerun the gates, and confirm the
reviewer PASS. Finish with the doc updates and a final verification report.

The user's original acceptance criteria are tasks 1-8 in this file. Tasks 1 and
5 are implemented; everything else is described above. Keep PT-BR user-facing
strings and English code/comments/commits. No em dashes.
