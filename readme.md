# Safety Barrier Monitor

Web dashboard tracking the operational state of safety barriers that protect
process equipment in an oil and gas facility. Barriers are imported read-only
from the operator's upstream maintenance system (Fracttal CMMS), normalised into
a compact Postgres model, and served by a Fresh/Preact dashboard.

Everything is Deno-only: one app serves SSR pages, the JSON API and the
dashboard island; the upstream sync and alert delivery loops run as separate
optional workers. There is no `package.json`, no `tsconfig.json`, no ORM, and
version and dependency pins live in [deno.jsonc](deno.jsonc) (current version
0.4.0).

## Stack

| Concern   | Choice                                        |
| --------- | --------------------------------------------- |
| Runtime   | Deno 2.9+                                     |
| Framework | Fresh 2.3.3 + Vite 7                          |
| UI        | Preact 10 + signals                           |
| Database  | PostgreSQL via `@db/postgres`                 |
| Auth      | Local passwords + optional Entra ID OIDC/PKCE |
| Alerts    | MSGFLOW HTTP provider (no local SMTP)         |
| Tests     | `deno test` + linkedom                        |

## Capabilities

- **Dashboard.** KPI grid, availability status band, compliance chart,
  filterable and server-paginated barrier table, barrier detail modal with
  contingency/status/history, health indicator, and an export menu.
- **Authentication.** Local password login is the break-glass path and cannot
  be disabled. Optional Microsoft Entra ID single sign-on uses the OIDC
  authorization-code flow with PKCE. Browser sessions are opaque 12-hour
  `barrier_session` cookies backed by hashed Postgres rows, not JWTs.
- **Accounts and roles.** Roles are `admin` and `user`. New local accounts get
  a per-person temporary password with a forced-change gate at
  `/trocar-senha`; Entra accounts have no local password.
- **Access groups.** Non-admin station visibility comes from access groups.
  No group means zero visible stations; admins are unrestricted. The scope is
  enforced in SQL, so client filters can narrow it but never widen it.
- **Alerts.** A local detector applies admin rules and dedup, then the MSGFLOW
  HTTP provider delivers. The audience is derived from active users: admins
  receive every station, non-admins the union of their access-group stations,
  and no group receives nothing. Every send path filters by the barrier
  station. The legacy `alert_recipients` records are not read by delivery.
- **Admin workspace.** Users, access groups, legacy recipient records, alert
  rules, field options, and sync history, with paging and bulk endpoints.
- **Fracttal sync.** Read-only GET integration, dry-run by default, upsert by
  `external_code`, soft deletes, client-side station mapping, and per-field
  ownership so an admin edit is not overwritten. Fracttal is never written to.
- **Export.** CSV, XLSX, and PDF of the current selection. The server streams
  the file in 5,000-row batches with a 200,000-row ceiling; the XLSX builder is
  in-house and no browser-side workbook holds a large export.
- **Settings.** Theme, accent, density, font size, reduced motion, and blur are
  browser-local in `localStorage`; nothing appearance-related is stored on the
  server.

## Quick start

Requires Deno 2.9+ and a reachable PostgreSQL database.

```bash
cp .env.example .env
# Edit .env: DATABASE_URL, APP_BASE_URL, COMPANY_NAME, and any optional values.
set -a; source .env; set +a
deno task db:migrate
deno task db:seed
deno task admin:create -- --email you@example.com
deno task dev
```

`admin:create` prompts for the admin password on masked stdin (12 characters
minimum). Do not pass `--password`: it is deprecated because the secret leaks
through shell history and the process list. For non-interactive installs use
the `ADMIN_PASSWORD` environment variable instead. When users already exist,
add `--confirm-existing` to create another admin intentionally.

Open `http://localhost:8300/login`.

## Production

Both supported deployment paths use the same build and database. Neither is
claimed here as the live deployment.

### Docker Compose

```bash
deno task docker:migrate
deno task docker:up
```

`docker:migrate` runs the migration script through the Compose `tools` service.
`docker:up` builds the image and starts the stack. The app binds
`127.0.0.1:8300`, with the bundled Caddy template available for TLS; the stack
also defines the Fracttal poller and alert-loop services. Use
`deno task docker:logs` to follow logs and `deno task docker:down` to stop.

### Windows Server (native)

The supported Windows path is Windows Server 2022/2025 with Deno, PostgreSQL,
NSSM, and Caddy, installed through [deploy/windows/Setup.cmd](deploy/windows/Setup.cmd).
Defaults target the APP10 topology: SeaMonitor* services, database `monitor`,
role `barrier`, PostgreSQL 18 binaries at `C:\sites\seacrest\.vendor\pgsql18\bin`,
backups under `D:\backups\monitor`, app on port 8300 bound to loopback (legacy
Barrier* via `-ServicePrefix Barrier` and `-DbName barreiras`). Secrets are
never passed on the command line; use env vars in an elevated shell or the
prompt. Setup self-elevates. Before production, run the unexecuted checklist in
[deploy/windows/ACCEPTANCE.md](deploy/windows/ACCEPTANCE.md). See
[docs/DEPLOY-WINDOWS.md](docs/DEPLOY-WINDOWS.md) for prerequisites, `.env`
values, and the idempotent upgrade flow.

### Standalone build

```bash
deno task build
deno task start
```

`start` reads `.env` and serves on port 8300; `start:alt` serves the same build
on 8301. Run migrations before the first start and after every schema change.

## Operations

```bash
deno task fracttal:import -- --dir /path/to/dump --apply
deno task fracttal:sync -- --live --apply
deno task fracttal:poll
deno task alerts:check
deno task alerts:poll
deno task doctor
```

`fracttal:import` and `fracttal:sync` are dry runs unless `--apply` is passed;
`--live` selects the upstream tenant. See [docs/FRACTTAL.md](docs/FRACTTAL.md)
and [docs/API.md](docs/API.md) for the task and route details.

## Documentation

| Document                                                 | Contents                                                 |
| -------------------------------------------------------- | -------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | Runtime, layers, auth/SSO, scoping, alerts, sync, deploy |
| [docs/API.md](docs/API.md)                               | Wire format, routes, batch endpoints, errors, throttling |
| [docs/DATABASE.md](docs/DATABASE.md)                     | Schema, migrations, auth columns, verification           |
| [docs/DEPLOY-WINDOWS.md](docs/DEPLOY-WINDOWS.md)         | Windows Server native deployment                         |
| [docs/FRACTTAL.md](docs/FRACTTAL.md)                     | Upstream endpoints, sync rules, operations, limits       |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)                     | Domain and identifier glossary                           |
| [docs/STATUSES.md](docs/STATUSES.md)                     | Barrier status definitions                               |
| [docs/PORT-MAP.md](docs/PORT-MAP.md)                     | Network ports used by the app and tooling                |
| [docs/USO.md](docs/USO.md)                               | User manual (PT-BR)                                      |
| [scripts/fixtures/README.md](scripts/fixtures/README.md) | Test fixtures and their synthetic data                   |
| [agents.md](agents.md)                                   | Repository rules for contributors and agents             |
| [DECISIONS.md](DECISIONS.md)                             | Architecture decision record                             |

## Naming and privacy

- The third-party maintenance system is the upstream CMMS (Fracttal); identifiers
  are vendor-prefixed.
- Operator identity comes from `COMPANY_NAME`; empty means unbranded.
- Credentials, tokens, and connection strings are never reproduced in this
  repository. Fixtures and tests are synthetic; any names in them are
  illustrative, not a production catalogue.
