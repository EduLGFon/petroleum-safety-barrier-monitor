# Architecture - Safety Barrier Monitor

Deno-only Fresh 2 + Vite + Preact islands. No ORM, no `package.json`.

## Runtime

`main.ts` boots one `App<State>` with `staticFiles()` and `fsRoutes()`. `client.ts` imports styles for HMR. Vite uses `@fresh/plugin-vite`.

Key tasks: `check`, `test`, `dev`, `build`, `preview`, `start`, `db:migrate`, `db:seed`, `fracttal:*`, `alerts:*`, `admin:create`, `docker:*`.

`COMPANY_NAME` is read per request. `_app.tsx` renders the shell and restores theme/accent/density/motion from `barrier-settings`.

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
- Status writes go only through `record_status_change()`.
- Filtering and sorting are centralized in `lib/server/sql/where.ts`.
- Exports stream from the database in batches.

## Data

Postgres holds lookups, barriers, contingency links, status history, users, sessions, alert rules/events/recipients, sync state and field options. Location and category ids are dynamic vocabularies served by the server. Soft deletes use `deleted_at`. Contingency links are local and independent of sync.

See `docs/API.md` and `docs/DATABASE.md`.
