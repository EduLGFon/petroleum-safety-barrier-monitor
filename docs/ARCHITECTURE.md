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

## Data

Postgres holds lookups, barriers, contingency links, status history, users, sessions, alert rules/events/recipients, sync state and field options. Location and category ids are dynamic vocabularies served by the server. Soft deletes use `deleted_at`. Contingency links are local and independent of sync.

See `docs/API.md` and `docs/DATABASE.md`.
