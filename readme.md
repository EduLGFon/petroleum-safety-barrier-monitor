# Safety Barrier Monitor

Web dashboard tracking operational state of safety barriers protecting process equipment in an oil and gas facility. Barriers are imported from the operator's upstream maintenance system (CMMS), normalised into a small Postgres model, and served to a Fresh/Preact dashboard.

Everything is Deno-only: one process serves SSR pages, JSON API, dashboard island, upstream sync loop and alert digest loop. No `package.json`, no `tsconfig.json`, no ORM.

## Naming and privacy

- The third-party maintenance system is the upstream CMMS. Identifiers are vendor-prefixed.
- Operator identity comes from `COMPANY_NAME`; empty means unbranded.
- No credentials, tokens, connection strings, e-mail addresses, station catalogues or tenant data are reproduced here.

## Features

- Dashboard: KPI grid, availability status band, compliance chart, filterable table, barrier modal, exports, health indicator, settings panel.
- Platform: mock or Postgres-backed data, session login with two roles, upstream sync, alert pipeline, Docker Compose and Windows Server paths.

## Stack

| Concern   | Choice                        |
| --------- | ----------------------------- |
| Runtime   | Deno 2.9+                     |
| Framework | Fresh 2 + Vite                |
| UI        | Preact 10 + signals           |
| Database  | PostgreSQL via `@db/postgres` |
| Mail      | Deno-native SMTP              |
| Tests     | `deno test` + linkedom        |

## Quick start

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
deno task db:migrate
deno task db:seed
deno task admin:create -- --email you@example.com --password 'at-least-12-chars'
deno task dev
```

Visit `http://localhost:5173/login`.

## Production

```bash
deno task build
deno task start
```

Docker:

```bash
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d
```

## Upstream data

```bash
deno task <vendor>:import -- --dir /path/to/dump --apply
deno task <vendor>:sync -- --live --apply
deno task <vendor>:poll
```

## Docs

`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/USO.md`, `docs/DEPLOY-WINDOWS.md`. Agent rules: `agents.md`. Decisions: `DECISIONS.md`.
